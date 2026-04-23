# ChatTube — Project Context for Claude

## What This Project Is
AI-powered YouTube learning tool. Users paste YouTube URLs, chat with the video content using RAG, get timestamp-synced answers that jump the video to the right moment, and use Study Mode to generate on-demand summaries, flashcards, and quizzes.

## Elevator Pitch (for README/recruiters)
> Paste any YouTube video, ask questions, and get AI answers with clickable timestamps that jump directly to where it's discussed. Add multiple videos and ask across all of them. Switch to Study Mode for on-demand summaries, key takeaways, flashcards, and quizzes — all powered by Gemini AI.

## Core Differentiators
- Timestamp-synced answers (click → video seeks to that moment)
- Multi-video library (ask across multiple videos, auto-switches player)
- Study Mode: lazy-loaded summary, key takeaways, flashcards, quiz (generated only on demand)
- Clean React + Tailwind UI with landing page → main app flow

## Tech Stack
- **LLM + Embeddings**: Gemini 1.5 Pro + text-embedding-004 (Google AI API)
- **Vector Store**: ChromaDB (local)
- **Transcript**: youtube-transcript-api (Python, free)
- **Backend**: FastAPI (Python)
- **Frontend**: React + Tailwind CSS
- **Containerization**: Docker + Docker Compose
- **Hosting**: AWS EC2 t2.micro (free tier)

## Folder Structure
```
chattube/
├── CLAUDE.md
├── docker-compose.yml
├── .env.example
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── main.py              # FastAPI app + routes
│   ├── ingestion.py         # transcript fetch, chunk, embed, store
│   ├── retrieval.py         # RAG query logic, timestamp extraction
│   ├── study.py             # summary/flashcard/quiz generation
│   └── vector_store.py      # ChromaDB interface
└── frontend/
    ├── Dockerfile
    ├── package.json
    └── src/
        ├── App.jsx
        ├── components/
        │   ├── LandingPage.jsx      # URL input entry point
        │   ├── VideoPlayer.jsx      # YouTube embed, auto-seek, auto-switch
        │   ├── Library.jsx          # Thumbnail bar, + Add Video (max 5)
        │   ├── ChatPanel.jsx        # Chat tab, streaming, timestamp links
        │   └── StudyMode.jsx        # Study tab, 4 lazy-load buttons
        └── index.css
```

## API Endpoints
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | /videos | Add video(s) — fetch transcript, chunk, embed, store |
| DELETE | /videos/{id} | Remove a video from session |
| POST | /query | RAG query → answer with timestamps |
| POST | /study | Generate study content (type: summary/takeaways/flashcards/quiz) |
| GET | /videos | List current session videos |

## UI Layout
```
Landing Page → paste URLs → "Load Videos" button → Main App

Main App:
┌─────────────────────────────────────────────────────────┐
│  Library: [Thumb 1] [Thumb 2 ▶] [Thumb 3] [+ Add]      │
├──────────────────────────┬──────────────────────────────┤
│                          │  [💬 Chat]  [📖 Study Mode]  │
│     YouTube Player       ├──────────────────────────────┤
│   (auto-seek/switch)     │  Chat messages or Study      │
│                          │  content (lazy loaded)        │
└──────────────────────────┴──────────────────────────────┘
```

## Study Mode
- Triggered by "Study Mode" tab in right panel
- Shows 4 buttons: Summary | Key Takeaways | Flashcards | Quiz
- Each generates ONLY when clicked (saves API cost)
- Works per-video (whichever is currently playing)
- Output replaces previous study content in the panel

## Multi-Video Behavior
- Max 5 videos per session
- RAG queries search across ALL loaded videos
- Each answer labels timestamps with their source video: `[2:34 — Video: Title]`
- Clicking a cross-video timestamp auto-switches the player to that video + seeks

## Build Phases
1. **Backend Core** — transcript ingestion, ChromaDB, RAG query, FastAPI endpoints
2. **Frontend** — landing page, main layout, chat with timestamp seek, study mode
3. **Docker** — Dockerfile x2, docker-compose.yml
4. **AWS Deploy** — EC2 t2.micro, public URL
5. **Polish** — README, demo GIF, error states

## Rules for Claude (IMPORTANT)
- ALWAYS present a plan and wait for user confirmation before writing any code
- If scope is unclear, ask — do not assume
- Explain trade-offs and WHY behind architectural decisions, not just what to type
- Keep costs minimal — Gemini free tier, ChromaDB local, AWS free tier
- One phase at a time — do not jump ahead without confirmation
