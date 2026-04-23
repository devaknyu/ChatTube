/*
  LandingPage.jsx — Entry point. User pastes one or more YouTube URLs and clicks Load.

  UX DECISIONS:
    - Textarea (not input) so users can paste multiple URLs on separate lines
    - We split by newline and filter blank lines server-side validation handles the rest
    - Partial success is shown: if 2/3 videos loaded, we enter the app and display
      the errors so the user knows which URLs failed without blocking them
    - A single loading spinner blocks the whole button during the POST — prevents double-submit
*/

import { useState } from 'react'

export default function LandingPage({ api, onVideosLoaded }) {
  const [urlText, setUrlText] = useState('')
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState([])

  async function handleSubmit(e) {
    e.preventDefault()
    const urls = urlText.split('\n').map(u => u.trim()).filter(Boolean)
    if (!urls.length) return

    setLoading(true)
    setErrors([])

    try {
      const res = await fetch(`${api}/videos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls }),
      })

      const data = await res.json()

      // 422 = all URLs failed — stay on landing page, show errors
      if (!res.ok && !data.added?.length) {
        const errs = Array.isArray(data.detail) ? data.detail : [{ error: data.detail }]
        setErrors(errs)
        return
      }

      // At least one video was added — enter the app
      // Show errors as warnings (handled by App via partial success display)
      if (data.errors?.length) {
        setErrors(data.errors)
      }

      if (data.added?.length) {
        onVideosLoaded(data.added)
      }
    } catch {
      setErrors([{ error: 'Could not reach the backend. Is it running on port 8000?' }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-lg">
        {/* Logo / heading */}
        <div className="text-center mb-10">
          <h1 className="text-5xl font-bold text-white mb-3">ChatTube</h1>
          <p className="text-gray-400 text-lg">
            Paste YouTube URLs. Ask questions. Get answers with clickable timestamps.
          </p>
        </div>

        {/* URL input form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <textarea
            value={urlText}
            onChange={e => setUrlText(e.target.value)}
            placeholder={
              'https://youtube.com/watch?v=...\nhttps://youtu.be/...\n\nPaste one or more URLs, one per line'
            }
            rows={5}
            className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-gray-100
                       placeholder-gray-600 focus:outline-none focus:border-blue-500 resize-none
                       text-sm leading-relaxed"
          />

          <button
            type="submit"
            disabled={loading || !urlText.trim()}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500
                       text-white font-semibold py-3 rounded-xl transition-colors"
          >
            {loading ? 'Loading videos…' : 'Load Videos'}
          </button>
        </form>

        {/* Error display */}
        {errors.length > 0 && (
          <div className="mt-4 space-y-2">
            {errors.map((err, i) => (
              <div key={i} className="bg-red-950 border border-red-800 rounded-lg px-4 py-2 text-sm text-red-300">
                {err.url && <span className="font-mono mr-2 text-red-400">{err.url}</span>}
                {err.error}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
