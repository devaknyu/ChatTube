"""
main.py — FastAPI application: routes, session state, request/response models

SESSION STATE:
  We keep the list of loaded videos in a plain Python dict (in-memory).
  This means restarting the server clears the session. That's intentional for now —
  this is a single-user dev tool, not a multi-user app.
  The ChromaDB data (vectors) DOES persist to disk across restarts.
  If you wanted persistence, you'd swap the dict for a database (SQLite/Postgres).

PYDANTIC MODELS:
  FastAPI uses Pydantic for request/response validation. Every route's input and output
  is typed via these models. This gives you automatic validation, error messages, and
  interactive API docs at /docs.
"""

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

from ingestion import extract_video_id, ingest_video
from retrieval import query_videos
from study import generate_study_content
from vector_store import delete_video_from_store

load_dotenv()

# ── In-memory session state ────────────────────────────────────────────────────
# Maps video_id → metadata dict. Plain dict is fine for a single-user session.
# {
#   "dQw4w9WgXcQ": {
#       "video_id": "dQw4w9WgXcQ",
#       "title": "Never Gonna Give You Up",
#       "thumbnail_url": "https://...",
#       "chunk_count": 42
#   }
# }
session_videos: dict[str, dict] = {}
MAX_VIDEOS = 5


# ── Pydantic request / response models ────────────────────────────────────────

class AddVideosRequest(BaseModel):
    urls: list[str]  # user can paste multiple URLs at once from the landing page


class AddVideosResponse(BaseModel):
    added: list[dict]
    errors: list[dict]


class QueryRequest(BaseModel):
    question: str
    video_ids: list[str] | None = None  # None = search all loaded videos


class QueryResponse(BaseModel):
    answer: str
    sources: list[dict]


class StudyRequest(BaseModel):
    video_id: str
    study_type: str  # "summary" | "takeaways" | "flashcards" | "quiz"


class StudyResponse(BaseModel):
    content: str


# ── App setup ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Warm up the vector store connection on startup so the first request isn't slow.
    from vector_store import get_vector_store
    get_vector_store()
    yield


app = FastAPI(title="ChatTube API", lifespan=lifespan)

# CORS: allow the React dev server (port 5173) and any production frontend to call the API.
# In production you'd restrict origins to your actual domain.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Routes ─────────────────────────────────────────────────────────────────────

@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.get("/videos")
def list_videos():
    """Return the current session's loaded videos."""
    return {"videos": list(session_videos.values())}


@app.post("/videos", response_model=AddVideosResponse)
def add_videos(body: AddVideosRequest):
    """
    Ingest one or more YouTube videos.
    Processes all URLs, returns per-URL success/error so the frontend
    can show partial success (some added, some failed) gracefully.
    """
    added = []
    errors = []

    for url in body.urls:
        try:
            video_id = extract_video_id(url)
            if not video_id:
                errors.append({"url": url, "error": "Could not parse video ID from URL"})
                continue

            if video_id in session_videos:
                errors.append({"url": url, "error": "Video already loaded"})
                continue

            if len(session_videos) >= MAX_VIDEOS:
                errors.append({"url": url, "error": f"Session limit of {MAX_VIDEOS} videos reached"})
                continue

            metadata = ingest_video(video_id)
            session_videos[video_id] = metadata
            added.append(metadata)

        except ValueError as e:
            errors.append({"url": url, "error": str(e)})
        except Exception as e:
            errors.append({"url": url, "error": f"Unexpected error: {str(e)}"})

    if not added and errors:
        raise HTTPException(status_code=422, detail=errors)

    return AddVideosResponse(added=added, errors=errors)


@app.delete("/videos/{video_id}")
def remove_video(video_id: str):
    """Remove a video from the session and delete its vectors from ChromaDB."""
    if video_id not in session_videos:
        raise HTTPException(status_code=404, detail="Video not in current session")

    delete_video_from_store(video_id)
    del session_videos[video_id]
    return {"message": f"Video {video_id} removed"}


@app.post("/query", response_model=QueryResponse)
def query(body: QueryRequest):
    """
    Run a RAG query across loaded videos (or a subset if video_ids is provided).
    Returns an answer with inline timestamp citations + a sources list for the frontend.
    """
    if not session_videos:
        raise HTTPException(status_code=400, detail="No videos loaded. Add a video first.")

    result = query_videos(question=body.question, video_ids=body.video_ids)
    return QueryResponse(**result)


@app.post("/study", response_model=StudyResponse)
def study(body: StudyRequest):
    """
    Generate study content for a specific video.
    study_type must be one of: summary, takeaways, flashcards, quiz
    """
    if body.video_id not in session_videos:
        raise HTTPException(status_code=404, detail="Video not in current session")

    try:
        content = generate_study_content(body.video_id, body.study_type)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    return StudyResponse(content=content)
