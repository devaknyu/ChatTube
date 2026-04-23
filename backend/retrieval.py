"""
retrieval.py — The ONLINE pipeline: user question → relevant chunks → LLM answer

FLOW (runs on every /query request):
  1. retriever.invoke(question)   embed the question, cosine-search ChromaDB, return top-k chunks
  2. format_docs_with_timestamps() build a context string that labels each chunk with [MM:SS — Title]
  3. RAG_PROMPT                   inject context + question into a prompt template
  4. llm.invoke(prompt)           Gemini generates an answer grounded in the context
  5. extract sources              pull timestamp + video_id out of the retrieved docs for the frontend

WHY SEPARATE RETRIEVAL FROM GENERATION?
  We could use LangChain's pre-built RetrievalQA chain which does all steps in one call.
  But then we can't get the source documents back easily (we need them for timestamp links).
  Doing retrieval manually (step 1) before the generation chain gives us the docs AND
  feeds them into the chain — best of both worlds.

WHAT IS LCEL?
  LangChain Expression Language (LCEL) is the modern way to compose chains using the
  pipe operator (|). It's equivalent to function composition: each step's output is the
  next step's input. The chain below reads: prompt → llm → parse output as string.
  LCEL chains are also lazy — they don't run until you call .invoke().
"""

from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.documents import Document

from vector_store import get_vector_store

LLM_MODEL = "llama-3.3-70b-versatile"

RAG_PROMPT = ChatPromptTemplate.from_template(
    """You are a helpful assistant answering questions about YouTube video content.

Rules:
- Answer ONLY using the context provided below. Do not use outside knowledge.
- After each fact you state, cite its source as [MM:SS — Video Title].
- If a question spans multiple videos, answer each part and cite each video separately.
- If the answer is not in the context, say exactly: "I couldn't find that in the video."

Context:
{context}

Question: {question}

Answer:"""
)


def format_docs_with_timestamps(docs: list[Document]) -> str:
    """
    Convert retrieved Document objects into a formatted context string.
    The [MM:SS — Title] prefix on each chunk is what teaches the LLM to cite timestamps.
    The LLM will mirror this format in its answer, which the frontend parses for seek links.
    """
    formatted = []
    for doc in docs:
        start_sec = int(doc.metadata.get("start_time", 0))
        mins, secs = divmod(start_sec, 60)
        timestamp = f"{mins}:{secs:02d}"
        title = doc.metadata.get("video_title", "Unknown Video")
        formatted.append(f"[{timestamp} — {title}]\n{doc.page_content}")
    return "\n\n".join(formatted)


def seconds_to_timestamp(seconds: int) -> str:
    mins, secs = divmod(seconds, 60)
    return f"{mins}:{secs:02d}"


def query_videos(question: str, video_ids: list[str] | None = None) -> dict:
    """
    Run a RAG query against the vector store and return the answer plus source metadata.

    Args:
        question:  the user's natural language question
        video_ids: if provided, restrict search to these videos (used for study mode
                   which is always per-video). None = search all loaded videos.

    Returns:
        {
            "answer": "The LLM-generated answer with inline [MM:SS — Title] citations",
            "sources": [{"video_id": ..., "video_title": ..., "start_time": ...}, ...]
        }
    """
    store = get_vector_store()

    # k=6 is a reasonable default — enough context without blowing up the prompt.
    # Retrieval quality degrades after ~10 chunks because noisy results start to appear.
    search_kwargs: dict = {"k": 6}
    if video_ids:
        # Chroma's metadata filter syntax mirrors MongoDB query operators.
        # $in = "field value is one of these". Single video = {"video_id": id} also works.
        search_kwargs["filter"] = {"video_id": {"$in": video_ids}}

    retriever = store.as_retriever(search_type="similarity", search_kwargs=search_kwargs)

    # Step 1: semantic search — embeds question, finds closest chunk vectors
    docs = retriever.invoke(question)

    if not docs:
        return {
            "answer": "I couldn't find any relevant content in the loaded videos.",
            "sources": [],
        }

    # Step 2: format docs into the context string the LLM will read
    context = format_docs_with_timestamps(docs)

    # Step 3: LCEL chain — prompt | llm | string parser
    llm = ChatGroq(model=LLM_MODEL, temperature=0)
    chain = RAG_PROMPT | llm | StrOutputParser()
    answer = chain.invoke({"context": context, "question": question})

    # Step 4: extract source metadata for the frontend's clickable timestamp links
    sources = [
        {
            "video_id": doc.metadata["video_id"],
            "video_title": doc.metadata["video_title"],
            "start_time": int(doc.metadata.get("start_time", 0)),
            "timestamp": seconds_to_timestamp(int(doc.metadata.get("start_time", 0))),
        }
        for doc in docs
    ]

    return {"answer": answer, "sources": sources}
