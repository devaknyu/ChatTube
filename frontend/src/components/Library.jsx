/*
  Library.jsx — Horizontal strip of loaded video thumbnails + "Add Video" button.

  DESIGN:
    - Active video gets a blue ring + play indicator overlay
    - Hover shows an X button to remove the video
    - "+ Add Video" opens an inline input (same flow as LandingPage, but mid-session)
    - MAX_VIDEOS=5 is enforced by the backend; we hide the add button once we hit the cap
      so users get a clear signal instead of a cryptic error
*/

import { useState } from 'react'

const MAX_VIDEOS = 5

export default function Library({ videos, activeVideoId, api, onSelect, onRemove, onVideosAdded }) {
  const [adding, setAdding] = useState(false)
  const [addText, setAddText] = useState('')
  const [addLoading, setAddLoading] = useState(false)
  const [addErrors, setAddErrors] = useState([])

  async function handleAdd(e) {
    e.preventDefault()
    const urls = addText.split('\n').map(u => u.trim()).filter(Boolean)
    if (!urls.length) return

    setAddLoading(true)
    setAddErrors([])

    try {
      const res = await fetch(`${api}/videos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls }),
      })
      const data = await res.json()

      if (data.added?.length) {
        onVideosAdded(data.added)
        setAddText('')
        setAdding(false)
      }
      if (data.errors?.length) {
        setAddErrors(data.errors)
      }
    } catch {
      setAddErrors([{ error: 'Request failed' }])
    } finally {
      setAddLoading(false)
    }
  }

  return (
    <div className="bg-gray-900 border-b border-gray-800 px-4 py-2 shrink-0">
      <div className="flex items-center gap-3 overflow-x-auto">
        {videos.map(video => (
          <div
            key={video.video_id}
            className="relative group shrink-0 cursor-pointer"
            onClick={() => onSelect(video.video_id)}
          >
            {/* Thumbnail */}
            <img
              src={video.thumbnail_url}
              alt={video.title}
              className={`w-28 h-16 object-cover rounded-lg transition-all ${
                video.video_id === activeVideoId
                  ? 'ring-2 ring-blue-500'
                  : 'opacity-60 hover:opacity-100'
              }`}
            />

            {/* Playing indicator */}
            {video.video_id === activeVideoId && (
              <div className="absolute bottom-1 left-1 bg-blue-600 rounded text-xs px-1 text-white font-medium">
                ▶
              </div>
            )}

            {/* Remove button — appears on hover */}
            <button
              onClick={e => { e.stopPropagation(); onRemove(video.video_id) }}
              className="absolute -top-1 -right-1 bg-gray-700 hover:bg-red-600 rounded-full
                         w-5 h-5 text-xs text-gray-300 hover:text-white
                         hidden group-hover:flex items-center justify-center transition-colors"
              title="Remove video"
            >
              ✕
            </button>

            {/* Title tooltip */}
            <div className="absolute bottom-0 left-0 right-0 bg-black/70 rounded-b-lg
                            text-xs text-gray-200 px-1 py-0.5 truncate opacity-0 group-hover:opacity-100 transition-opacity">
              {video.title}
            </div>
          </div>
        ))}

        {/* Add Video button / inline form */}
        {videos.length < MAX_VIDEOS && (
          adding ? (
            <form onSubmit={handleAdd} className="flex flex-col gap-1 min-w-48">
              <textarea
                value={addText}
                onChange={e => setAddText(e.target.value)}
                placeholder="Paste YouTube URL(s)"
                rows={2}
                autoFocus
                className="bg-gray-800 border border-gray-600 rounded-lg px-2 py-1
                           text-xs text-gray-100 placeholder-gray-500 focus:outline-none
                           focus:border-blue-500 resize-none"
              />
              <div className="flex gap-1">
                <button
                  type="submit"
                  disabled={addLoading}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700
                             text-white text-xs font-medium py-1 rounded-lg transition-colors"
                >
                  {addLoading ? '…' : 'Add'}
                </button>
                <button
                  type="button"
                  onClick={() => { setAdding(false); setAddErrors([]) }}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-300
                             text-xs py-1 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
              {addErrors.map((err, i) => (
                <p key={i} className="text-red-400 text-xs">{err.error}</p>
              ))}
            </form>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="shrink-0 w-28 h-16 rounded-lg border-2 border-dashed border-gray-700
                         hover:border-blue-500 text-gray-500 hover:text-blue-400
                         flex flex-col items-center justify-center text-xs transition-colors"
            >
              <span className="text-2xl leading-none">+</span>
              <span>Add Video</span>
            </button>
          )
        )}
      </div>
    </div>
  )
}
