"""
ingestion.py — The OFFLINE pipeline: URL → transcript → chunks → embeddings → stored

FLOW (runs once per video, when user adds it):
  1. extract_video_id()     parse the YouTube URL to get the bare video ID
  2. fetch_video_metadata() hit YouTube's free oEmbed API for title + thumbnail
  3. fetch_transcript()     youtube-transcript-api pulls the auto/manual captions
  4. build_documents()      group transcript entries into 30-second windows,
                            wrap each window as a LangChain Document with metadata
  5. split_documents()      RecursiveCharacterTextSplitter further splits large windows
  6. store.add_documents()  LangChain embeds each chunk and stores vector + text + metadata

WHY 30-SECOND WINDOWS?
  Each transcript entry from youtube-transcript-api is ~1 short sentence (a few words).
  If we sent each tiny entry to the splitter individually, we'd end up with hundreds of
  micro-chunks that lack context. Grouping into ~30s windows gives the LLM enough
  surrounding text to produce meaningful answers, while keeping timestamp precision good
  enough for the user to seek to the right moment.

WHY RecursiveCharacterTextSplitter?
  It tries splitting on [paragraph, newline, sentence, word] in order — it only falls
  back to a coarser boundary when the chunk is still too big. This preserves natural
  language boundaries better than a naive character-count split.
  chunk_size=500 ≈ 30-60s of speech. chunk_overlap=50 prevents a sentence from being
  cut in half and losing its meaning at the boundary between two chunks.
"""

import re
import requests
from urllib.parse import urlparse, parse_qs

from youtube_transcript_api import YouTubeTranscriptApi, TranscriptsDisabled, NoTranscriptFound
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

from vector_store import get_vector_store

WINDOW_SECONDS = 30  # how many seconds of transcript to group into one Document


def extract_video_id(url: str) -> str | None:
    """Parse a YouTube URL in any common format and return the bare video ID."""
    # youtu.be/VIDEO_ID
    if "youtu.be" in url:
        return url.split("/")[-1].split("?")[0]
    # youtube.com/watch?v=VIDEO_ID
    parsed = urlparse(url)
    params = parse_qs(parsed.query)
    return params.get("v", [None])[0]


def fetch_video_metadata(video_id: str) -> dict:
    """
    Use YouTube's free oEmbed endpoint (no API key) to get title and thumbnail.
    oEmbed is a standard protocol — same approach works for Vimeo, SoundCloud, etc.
    """
    url = f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={video_id}&format=json"
    response = requests.get(url, timeout=10)
    response.raise_for_status()
    data = response.json()
    return {
        "title": data["title"],
        "thumbnail_url": data["thumbnail_url"],
    }


def fetch_transcript(video_id: str) -> list[dict]:
    """
    Fetch the transcript for a video. Returns a list of dicts:
      [{"text": "...", "start": 12.4, "duration": 3.2}, ...]
    start is in seconds from the beginning of the video — this becomes our timestamp.
    """
    try:
        transcript = YouTubeTranscriptApi().fetch(video_id)
        return transcript.to_raw_data() if hasattr(transcript, "to_raw_data") else transcript
    except TranscriptsDisabled:
        raise ValueError(f"Transcripts are disabled for video {video_id}")
    except NoTranscriptFound:
        raise ValueError(f"No transcript found for video {video_id}")


def build_documents(
    transcript: list[dict],
    video_id: str,
    video_title: str,
    window_seconds: int = WINDOW_SECONDS,
) -> list[Document]:
    """
    Group transcript entries into fixed-time windows and wrap them as LangChain Documents.

    Each Document carries metadata that will be stored alongside the vector in ChromaDB.
    This metadata is what powers the timestamp-seek feature: when the LLM cites a chunk,
    we read start_time from that chunk's metadata and tell the frontend to seek there.

    LangChain's Document is just: { page_content: str, metadata: dict }
    """
    documents = []
    window_text: list[str] = []
    window_start: float | None = None

    for entry in transcript:
        if window_start is None:
            window_start = entry["start"]

        window_text.append(entry["text"])
        window_end = entry["start"] + entry["duration"]

        if window_end - window_start >= window_seconds:
            documents.append(Document(
                page_content=" ".join(window_text),
                metadata={
                    "video_id": video_id,
                    "video_title": video_title,
                    "start_time": window_start,
                },
            ))
            window_text = []
            window_start = None

    # flush any remaining text that didn't fill a full window
    if window_text:
        documents.append(Document(
            page_content=" ".join(window_text),
            metadata={
                "video_id": video_id,
                "video_title": video_title,
                "start_time": window_start or 0.0,
            },
        ))

    return documents


def ingest_video(video_id: str) -> dict:
    """
    Full ingestion pipeline for one video. Returns the video metadata dict
    so main.py can add it to the session without making a second network call.

    This function is called once when the user adds a video. After it returns,
    the video's chunks live in ChromaDB and every subsequent /query is fast.
    """
    metadata = fetch_video_metadata(video_id)
    transcript = fetch_transcript(video_id)

    raw_docs = build_documents(transcript, video_id, metadata["title"])

    # RecursiveCharacterTextSplitter inherits metadata from the source Document,
    # so every sub-chunk keeps its video_id, video_title, and start_time.
    splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)
    chunks = splitter.split_documents(raw_docs)

    store = get_vector_store()
    store.add_documents(chunks)

    return {
        "video_id": video_id,
        "title": metadata["title"],
        "thumbnail_url": metadata["thumbnail_url"],
        "chunk_count": len(chunks),
    }
