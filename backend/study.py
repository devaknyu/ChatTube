"""
study.py — On-demand study content generation (summary, takeaways, flashcards, quiz)

DESIGN DECISION — lazy generation:
  Study content is NOT pre-generated when a video is added. It's generated only when
  the user clicks a study button. This matters because Gemini 1.5 Pro has a generous
  free tier (15 RPM, 1M tokens/day as of mid-2025), but generating 4 study outputs
  per video automatically would burn that budget fast. Lazy = cost-efficient.

HOW WE GET "ALL" VIDEO CONTENT FOR STUDY MODE:
  For chat (retrieval.py), we use semantic search — we only want the most relevant chunks.
  For study mode, we want a REPRESENTATIVE SAMPLE of the whole video so the summary/quiz
  covers the full content, not just one topic. We do this with ChromaDB's .get() which
  returns documents by metadata filter without any embedding comparison.

  Trade-off: for a very long video (100+ chunks), sending all chunks to the LLM can
  exceed the context window or get expensive. We cap at MAX_CHUNKS_FOR_STUDY and take
  evenly spaced chunks so we sample the whole video, not just the beginning.
"""

from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

from vector_store import get_vector_store

LLM_MODEL = "llama-3.3-70b-versatile"
MAX_CHUNKS_FOR_STUDY = 40  # ~20 minutes of content at 30s/chunk

STUDY_PROMPTS: dict[str, str] = {
    "summary": """You are a study assistant. Based on the video transcript excerpts below,
write a clear, well-structured summary of the video in 3-5 paragraphs.
Cover the main topics, key arguments, and conclusions.

Transcript excerpts:
{context}

Summary:""",

    "takeaways": """You are a study assistant. Based on the video transcript excerpts below,
extract the 5-8 most important key takeaways a viewer should remember.
Format as a numbered list. Each takeaway should be one concise sentence.

Transcript excerpts:
{context}

Key Takeaways:""",

    "flashcards": """You are a study assistant. Based on the video transcript excerpts below,
create 8-10 flashcards to help someone study and memorize the content.
Format each flashcard as:
Q: [question]
A: [answer]

Make questions specific and testable, not vague.

Transcript excerpts:
{context}

Flashcards:""",

    "quiz": """You are a study assistant. Based on the video transcript excerpts below,
create a 5-question multiple-choice quiz.
Format each question as:
Q[n]: [question]
A) [option]
B) [option]
C) [option]
D) [option]
Answer: [correct letter]

Make questions that test understanding, not just memorization of exact phrases.

Transcript excerpts:
{context}

Quiz:""",
}


def get_video_chunks_for_study(video_id: str) -> str:
    """
    Retrieve all stored chunks for a video and return them as a single context string.
    Uses ChromaDB's .get() (metadata filter) rather than similarity search,
    because for study mode we want full coverage, not just the most similar chunks.
    """
    store = get_vector_store()

    # Access the underlying ChromaDB collection directly for a metadata-only query.
    # If you swap to Pinecone: results = index.query(filter={"video_id": video_id}, top_k=MAX_CHUNKS_FOR_STUDY)
    raw = store._collection.get(
        where={"video_id": video_id},
        include=["documents", "metadatas"],
    )

    documents = raw.get("documents", [])
    metadatas = raw.get("metadatas", [])

    if not documents:
        return ""

    # Sort by start_time so the context reads chronologically
    paired = sorted(zip(metadatas, documents), key=lambda x: x[0].get("start_time", 0))

    # Evenly sample if we have more chunks than the LLM context budget allows
    if len(paired) > MAX_CHUNKS_FOR_STUDY:
        step = len(paired) // MAX_CHUNKS_FOR_STUDY
        paired = paired[::step][:MAX_CHUNKS_FOR_STUDY]

    # Format with timestamps for context (even though study prompts don't cite them,
    # the LLM uses them to understand chronological order)
    lines = []
    for meta, text in paired:
        start_sec = int(meta.get("start_time", 0))
        mins, secs = divmod(start_sec, 60)
        lines.append(f"[{mins}:{secs:02d}] {text}")

    return "\n\n".join(lines)


def generate_study_content(video_id: str, study_type: str) -> str:
    """
    Generate study content of the given type for the given video.

    Args:
        video_id:   the YouTube video ID
        study_type: one of "summary", "takeaways", "flashcards", "quiz"

    Returns:
        The LLM-generated study content as a plain string.
    """
    if study_type not in STUDY_PROMPTS:
        raise ValueError(f"Unknown study type: {study_type}. Must be one of {list(STUDY_PROMPTS)}")

    context = get_video_chunks_for_study(video_id)
    if not context:
        raise ValueError(f"No content found for video {video_id}. Was it ingested?")

    prompt = ChatPromptTemplate.from_template(STUDY_PROMPTS[study_type])
    llm = ChatGroq(model=LLM_MODEL, temperature=0.3)

    chain = prompt | llm | StrOutputParser()
    return chain.invoke({"context": context})
