import { useState } from 'react'

export default function LandingPage({ api, onVideosLoaded }) {
  const [mode, setMode] = useState('search')       // 'search' | 'url'

  // URL mode state — one input per URL, dynamically add/remove rows
  const [urls, setUrls] = useState([''])

  // Search mode state
  const [query, setQuery]         = useState('')
  const [results, setResults]     = useState([])
  const [selected, setSelected]   = useState(new Set())
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState(null)

  // Shared
  const [loading, setLoading] = useState(false)
  const [errors, setErrors]   = useState([])

  // ── URL mode helpers ───────────────────────────────────────────────────────
  function addUrl() {
    setUrls(prev => [...prev, ''])
  }

  function removeUrl(i) {
    setUrls(prev => prev.filter((_, idx) => idx !== i))
  }

  function updateUrl(i, val) {
    setUrls(prev => prev.map((u, idx) => idx === i ? val : u))
  }

  async function handleUrlSubmit(e) {
    e.preventDefault()
    const validUrls = urls.map(u => u.trim()).filter(Boolean)
    if (!validUrls.length) return
    await loadVideos(validUrls)
  }

  // ── Search mode ────────────────────────────────────────────────────────────
  async function handleSearch(e) {
    e.preventDefault()
    if (!query.trim()) return
    setSearching(true)
    setSearchError(null)
    setResults([])
    setSelected(new Set())

    try {
      const res = await fetch(`${api}/search?q=${encodeURIComponent(query.trim())}&n=5`)
      const data = await res.json()
      if (!res.ok) {
        setSearchError(data.detail || 'Search failed.')
        return
      }
      setResults(data.results)
      if (data.results.length === 0) setSearchError('No results found. Try a different topic.')
    } catch {
      setSearchError('Could not reach the backend. Is it running?')
    } finally {
      setSearching(false)
    }
  }

  function toggleSelect(videoId) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(videoId)) next.delete(videoId)
      else next.add(videoId)
      return next
    })
  }

  async function handleLoadSelected() {
    if (!selected.size) return
    const urls = [...selected].map(id => `https://www.youtube.com/watch?v=${id}`)
    await loadVideos(urls)
  }

  // ── Shared ingestion call ──────────────────────────────────────────────────
  async function loadVideos(urlList) {
    setLoading(true)
    setErrors([])
    try {
      const res = await fetch(`${api}/videos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: urlList }),
      })
      const data = await res.json()

      if (!res.ok && !data.added?.length) {
        const errs = Array.isArray(data.detail) ? data.detail : [{ error: data.detail }]
        setErrors(errs)
        return
      }

      if (data.errors?.length) setErrors(data.errors)
      if (data.added?.length)  onVideosLoaded(data.added)
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
            Search any topic or paste a URL. Ask questions and get AI answers with clickable timestamps.
          </p>
        </div>

        {/* Mode toggle — Search first */}
        <div className="flex bg-gray-900 border border-gray-700 rounded-xl p-1 mb-5">
          <button
            onClick={() => setMode('search')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === 'search'
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Search by Topic
          </button>
          <button
            onClick={() => setMode('url')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === 'url'
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Paste URLs
          </button>
        </div>

        {/* ── Search mode ── */}
        {mode === 'search' && (
          <div className="space-y-4">
            <form onSubmit={handleSearch} className="flex gap-2">
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="e.g. machine learning basics, react hooks tutorial…"
                className="flex-1 bg-gray-900 border border-gray-700 rounded-xl px-4 py-3
                           text-sm text-gray-100 placeholder-gray-500 focus:outline-none
                           focus:border-blue-500"
              />
              <button
                type="submit"
                disabled={searching || !query.trim()}
                className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500
                           text-white px-5 py-3 rounded-xl text-sm font-medium transition-colors shrink-0"
              >
                {searching ? '…' : 'Search'}
              </button>
            </form>

            {searchError && (
              <div className="bg-red-950 border border-red-800 rounded-lg px-4 py-2 text-sm text-red-300">
                {searchError}
              </div>
            )}

            {results.length > 0 && (
              <>
                <div className="space-y-2">
                  {results.map(video => {
                    const isSelected = selected.has(video.video_id)
                    return (
                      <button
                        key={video.video_id}
                        onClick={() => toggleSelect(video.video_id)}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left
                                    transition-colors ${
                                      isSelected
                                        ? 'bg-blue-600/20 border-blue-600'
                                        : 'bg-gray-900 border-gray-700 hover:border-gray-500'
                                    }`}
                      >
                        <img
                          src={video.thumbnail_url}
                          alt=""
                          className="w-24 h-14 object-cover rounded-lg shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-100 font-medium leading-snug line-clamp-2">
                            {video.title}
                          </p>
                          <p className="text-xs text-gray-500 mt-1 truncate">{video.channel_title}</p>
                        </div>
                        <div className={`w-5 h-5 rounded border-2 shrink-0 flex items-center justify-center ${
                          isSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-600'
                        }`}>
                          {isSelected && <span className="text-white text-xs">✓</span>}
                        </div>
                      </button>
                    )
                  })}
                </div>

                <button
                  onClick={handleLoadSelected}
                  disabled={loading || selected.size === 0}
                  className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700
                             disabled:text-gray-500 text-white font-semibold py-3 rounded-xl
                             transition-colors"
                >
                  {loading
                    ? 'Loading videos…'
                    : selected.size === 0
                      ? 'Select videos to load'
                      : `Load ${selected.size} video${selected.size > 1 ? 's' : ''}`
                  }
                </button>
              </>
            )}
          </div>
        )}

        {/* ── URL mode ── */}
        {mode === 'url' && (
          <form onSubmit={handleUrlSubmit} className="space-y-3">
            <div className="space-y-2">
              {urls.map((url, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={url}
                    onChange={e => updateUrl(i, e.target.value)}
                    placeholder="https://youtube.com/watch?v=..."
                    className="flex-1 bg-gray-900 border border-gray-700 rounded-xl px-4 py-3
                               text-sm text-gray-100 placeholder-gray-600 focus:outline-none
                               focus:border-blue-500"
                  />
                  {urls.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeUrl(i)}
                      className="text-gray-500 hover:text-red-400 px-2 py-1 transition-colors text-lg leading-none"
                      title="Remove"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>

            {urls.length < 5 && (
              <button
                type="button"
                onClick={addUrl}
                className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
              >
                + Add another URL
              </button>
            )}

            <button
              type="submit"
              disabled={loading || !urls.some(u => u.trim())}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500
                         text-white font-semibold py-3 rounded-xl transition-colors"
            >
              {loading ? 'Loading videos…' : 'Load Videos'}
            </button>
          </form>
        )}

        {/* Shared error display */}
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
