/*
  StudyMode.jsx — On-demand study content generation for the active video.

  LAZY LOADING:
    No content is fetched on mount. Each button triggers a POST /study only when clicked.
    This mirrors the backend's lazy design — we don't burn API quota until the user asks.

  STATE PER STUDY TYPE:
    We cache generated content in a `cache` object keyed by `${videoId}_${studyType}`.
    If the user switches to a different video and comes back, or clicks the same button
    again, we return the cached result instead of re-fetching. The cache is cleared when
    the component unmounts (it's just local state — intentional for a dev tool).

  FORMATTING:
    The LLM returns plain text with newlines. We render it in a <pre> with whitespace-pre-wrap
    so flashcards, numbered lists, and Q/A pairs display correctly without a markdown parser.
*/

import { useState } from 'react'

const STUDY_TYPES = [
  { key: 'summary',    label: 'Summary',       icon: '📝' },
  { key: 'takeaways',  label: 'Key Takeaways',  icon: '💡' },
  { key: 'flashcards', label: 'Flashcards',     icon: '🃏' },
  { key: 'quiz',       label: 'Quiz',           icon: '❓' },
]

export default function StudyMode({ api, activeVideoId, videos }) {
  const [activeType, setActiveType] = useState(null)
  const [cache, setCache] = useState({})   // { "videoId_studyType": content }
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const activeVideo = videos.find(v => v.video_id === activeVideoId)
  const cacheKey = activeVideoId && activeType ? `${activeVideoId}_${activeType}` : null
  const content = cacheKey ? cache[cacheKey] : null

  async function handleTypeClick(studyType) {
    setActiveType(studyType)
    setError(null)

    const key = `${activeVideoId}_${studyType}`
    if (cache[key]) return  // already generated — serve from cache

    setLoading(true)
    try {
      const res = await fetch(`${api}/study`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_id: activeVideoId, study_type: studyType }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.detail || 'Generation failed.')
        return
      }

      setCache(prev => ({ ...prev, [key]: data.content }))
    } catch {
      setError('Could not reach the backend.')
    } finally {
      setLoading(false)
    }
  }

  if (!activeVideoId) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">
        Select a video to use Study Mode
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Video context header */}
      <div className="px-4 py-2 border-b border-gray-800 shrink-0">
        <p className="text-xs text-gray-500 truncate">
          Studying: <span className="text-gray-300">{activeVideo?.title}</span>
        </p>
      </div>

      {/* Study type buttons */}
      <div className="grid grid-cols-4 gap-2 px-4 py-3 shrink-0">
        {STUDY_TYPES.map(({ key, label, icon }) => {
          const cached = !!cache[`${activeVideoId}_${key}`]
          const isActive = activeType === key
          return (
            <button
              key={key}
              onClick={() => handleTypeClick(key)}
              disabled={loading && activeType === key}
              className={`flex flex-col items-center gap-1 py-2 px-1 rounded-xl text-xs
                          font-medium transition-colors border
                          ${isActive
                            ? 'bg-blue-600/20 border-blue-600 text-blue-300'
                            : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200'
                          }`}
            >
              <span className="text-base">{icon}</span>
              <span>{label}</span>
              {cached && !isActive && (
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" title="Cached" />
              )}
            </button>
          )
        })}
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {!activeType && (
          <p className="text-gray-600 text-sm text-center mt-8">
            Choose a study format above
          </p>
        )}

        {loading && (
          <div className="flex items-center justify-center mt-8 gap-2 text-gray-500 text-sm">
            <span className="animate-spin">⟳</span>
            Generating {STUDY_TYPES.find(t => t.key === activeType)?.label}…
          </div>
        )}

        {error && (
          <div className="bg-red-950 border border-red-800 rounded-xl px-4 py-3 mt-4
                          text-red-300 text-sm">
            {error}
          </div>
        )}

        {content && !loading && (
          <pre className="whitespace-pre-wrap text-sm text-gray-200 leading-relaxed
                          font-sans bg-gray-900 rounded-xl px-4 py-4 mt-2">
            {content}
          </pre>
        )}
      </div>
    </div>
  )
}
