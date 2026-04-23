/*
  ChatPanel.jsx — The chat interface for RAG queries.

  MESSAGE RENDERING:
    The LLM embeds timestamp citations inline: "The author explains X [2:34 — Video Title]"
    We parse these with a regex and replace them with clickable <button> elements.
    Clicking one calls onTimestampClick(videoId, seconds), which App.jsx routes to
    VideoPlayer via the seekTo state.

  FINDING VIDEO ID FROM TITLE:
    The backend stores video_title in metadata and the LLM cites it by title (not ID).
    So when the user clicks [2:34 — Some Video Title], we need to find the video_id
    that matches "Some Video Title". We do a case-insensitive search against the loaded
    videos array passed from App.jsx.

  SOURCES PANEL:
    Below each assistant message we show a collapsible list of source chunks the
    retriever pulled. This is the "glass box" feature — users can verify where
    the answer came from and click individual sources to jump there too.
*/

import { useState, useRef, useEffect } from 'react'

// Matches: [2:34 — Video Title] or [1:02:34 — Video Title]
const TIMESTAMP_REGEX = /\[(\d{1,2}:\d{2}(?::\d{2})?)\s*[—–-]\s*([^\]]+)\]/g

function parseTimestamp(ts) {
  // "1:02:34" → seconds,  "2:34" → seconds
  const parts = ts.split(':').map(Number)
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  return parts[0] * 60 + parts[1]
}

function renderMessageContent(text, videos, onTimestampClick) {
  // Split the text around timestamp citations, render citations as buttons
  const parts = []
  let lastIndex = 0
  let match

  const regex = new RegExp(TIMESTAMP_REGEX.source, 'g')
  while ((match = regex.exec(text)) !== null) {
    // Text before the citation
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }

    const [full, timestamp, title] = match
    const seconds = parseTimestamp(timestamp)
    const video = videos.find(v => v.title.toLowerCase().includes(title.trim().toLowerCase()))

    if (video) {
      parts.push(
        <button
          key={match.index}
          onClick={() => onTimestampClick(video.video_id, seconds)}
          className="inline-flex items-center gap-1 bg-blue-900/50 hover:bg-blue-700/60
                     border border-blue-700/50 rounded px-1.5 py-0.5 text-blue-300
                     hover:text-blue-100 text-xs font-mono transition-colors mx-0.5"
          title={`Jump to ${timestamp} in "${video.title}"`}
        >
          ▶ {timestamp}
        </button>
      )
    } else {
      // Video not found — render as plain styled text
      parts.push(
        <span key={match.index} className="text-blue-400 font-mono text-xs">{full}</span>
      )
    }

    lastIndex = match.index + full.length
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return parts
}

export default function ChatPanel({ api, videos, onTimestampClick }) {
  const [messages, setMessages] = useState([])  // [{role: 'user'|'assistant', text, sources}]
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [expandedSources, setExpandedSources] = useState({})
  const bottomRef = useRef(null)

  // Auto-scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend(e) {
    e.preventDefault()
    const question = input.trim()
    if (!question || loading) return

    setInput('')
    setMessages(prev => [...prev, { role: 'user', text: question }])
    setLoading(true)

    try {
      const res = await fetch(`${api}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      })
      const data = await res.json()

      if (!res.ok) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          text: data.detail || 'Something went wrong.',
          sources: [],
        }])
        return
      }

      setMessages(prev => [...prev, {
        role: 'assistant',
        text: data.answer,
        sources: data.sources || [],
      }])
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: 'Could not reach the backend.',
        sources: [],
      }])
    } finally {
      setLoading(false)
    }
  }

  function toggleSources(index) {
    setExpandedSources(prev => ({ ...prev, [index]: !prev[index] }))
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <p className="text-gray-600 text-sm text-center mt-8">
            Ask anything about the loaded video(s)
          </p>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] ${msg.role === 'user' ? 'order-1' : ''}`}>
              {/* Bubble */}
              <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-br-sm'
                  : 'bg-gray-800 text-gray-100 rounded-bl-sm'
              }`}>
                {msg.role === 'assistant'
                  ? renderMessageContent(msg.text, videos, onTimestampClick)
                  : msg.text
                }
              </div>

              {/* Sources toggle for assistant messages */}
              {msg.role === 'assistant' && msg.sources?.length > 0 && (
                <div className="mt-1">
                  <button
                    onClick={() => toggleSources(i)}
                    className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                  >
                    {expandedSources[i] ? '▲ Hide sources' : `▼ ${msg.sources.length} source${msg.sources.length > 1 ? 's' : ''}`}
                  </button>

                  {expandedSources[i] && (
                    <div className="mt-1 space-y-1">
                      {msg.sources.map((src, j) => (
                        <button
                          key={j}
                          onClick={() => onTimestampClick(src.video_id, src.start_time)}
                          className="block w-full text-left bg-gray-900 hover:bg-gray-800
                                     border border-gray-700 rounded-lg px-3 py-1.5 text-xs
                                     text-gray-400 hover:text-gray-200 transition-colors"
                        >
                          <span className="font-mono text-blue-400 mr-2">{src.timestamp}</span>
                          <span className="truncate">{src.video_title}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-800 rounded-2xl rounded-bl-sm px-4 py-2.5">
              <span className="flex gap-1">
                {[0, 1, 2].map(n => (
                  <span
                    key={n}
                    className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce"
                    style={{ animationDelay: `${n * 0.15}s` }}
                  />
                ))}
              </span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <form
        onSubmit={handleSend}
        className="px-4 py-3 border-t border-gray-800 flex gap-2 shrink-0"
      >
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Ask about the video…"
          disabled={loading}
          className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5
                     text-sm text-gray-100 placeholder-gray-500 focus:outline-none
                     focus:border-blue-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500
                     text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
        >
          Send
        </button>
      </form>
    </div>
  )
}
