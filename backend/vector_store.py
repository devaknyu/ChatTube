"""
vector_store.py — THE ONLY FILE YOU NEED TO TOUCH TO SWAP VECTOR STORES OR EMBEDDINGS

LangChain abstracts both the embedding model and the vector database behind standard
interfaces. Every other file in this project calls get_vector_store() and never imports
Chroma or Google directly — so a vendor swap stays contained here.

SWAP EXAMPLES:
  Embeddings: replace GoogleGenerativeAIEmbeddings with OpenAIEmbeddings("text-embedding-3-small")
  Vector DB:  replace Chroma with PineconeVectorStore, QdrantVectorStore, or FAISS
"""

import os
from langchain_chroma import Chroma
from langchain_google_genai import GoogleGenerativeAIEmbeddings

# Module-level singleton — we reuse one client instead of re-opening the DB on every request.
_store: Chroma | None = None


def get_embeddings() -> GoogleGenerativeAIEmbeddings:
    # SWAP POINT 1: change the embedding model here.
    # text-embedding-004 produces 768-dim vectors. OpenAI's text-embedding-3-small
    # produces 1536-dim vectors. Larger dims = more expressive but slower + costlier.
    return GoogleGenerativeAIEmbeddings(model="gemini-embedding-001")


def get_vector_store() -> Chroma:
    global _store
    if _store is not None:
        return _store

    # SWAP POINT 2: replace Chroma(...) with PineconeVectorStore(...) etc.
    # persist_directory tells Chroma to write to disk so data survives restarts.
    # Without it, Chroma runs in-memory and everything is lost on shutdown.
    _store = Chroma(
        collection_name="chattube",
        embedding_function=get_embeddings(),
        persist_directory="./chroma_db",
    )
    return _store


def delete_video_from_store(video_id: str) -> None:
    """Remove all chunks belonging to a video from the vector store."""
    store = get_vector_store()
    # We access the underlying ChromaDB collection directly here because LangChain's
    # Chroma wrapper doesn't expose a delete-by-metadata method.
    # If you swap to Pinecone, replace this with: index.delete(filter={"video_id": video_id})
    store._collection.delete(where={"video_id": video_id})
