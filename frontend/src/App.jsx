/*
  App.jsx — Root component. Owns all shared state so child components stay pure/dumb.

  STATE DESIGN:
    videos        — list of loaded video metadata objects from the backend
    activeVideoId — which video is currently in the player
    seekTo        — {videoId, seconds} signal. When VideoPlayer sees a new seekTo object,
                    it checks if the video matches (switch if not), then calls player.seekTo().
                    Using an object (not just seconds) lets us detect when the same timestamp
                    is clicked twice — a new object reference always triggers the effect.

  WHY LIFT STATE HERE?
    ChatPanel produces timestamp clicks → VideoPlayer needs to react to them.
    Library produces video selection → VideoPlayer needs to switch.
    These two components are siblings, so state must live in their common ancestor (App).
    This is the standard React pattern: "lift state up".
*/

import { useState } from 'react'
import LandingPage from './components/LandingPage.jsx'
import Library from './components/Library.jsx'
import VideoPlayer from './components/VideoPlayer.jsx'
import ChatPanel from './components/ChatPanel.jsx'
import StudyMode from './components/StudyMode.jsx'
import NotesPanel from './components/NotesPanel.jsx'

const API = '/api'

export default function App() {
  const [videos, setVideos] = useState([])          // [{video_id, title, thumbnail_url, chunk_count}]
  const [activeVideoId, setActiveVideoId] = useState(null)
  const [seekTo, setSeekTo] = useState(null)        // {videoId, seconds} — null = no pending seek
  const [activeTab, setActiveTab] = useState('chat') // 'chat' | 'study' | 'notes'
  const [notes, setNotes] = useState([])             // [{id, text, source}]

  // Called by LandingPage after successfully loading the first batch of videos
  function handleVideosLoaded(newVideos) {
    setVideos(newVideos)
    setActiveVideoId(newVideos[0]?.video_id ?? null)
  }

  // Called by Library's "+ Add Video" flow after adding more videos mid-session
  function handleVideosAdded(addedVideos) {
    setVideos(prev => [...prev, ...addedVideos])
  }

  // Called by Library when user clicks a thumbnail
  function handleSelectVideo(videoId) {
    setActiveVideoId(videoId)
  }

  // Called by Library's remove button
  async function handleRemoveVideo(videoId) {
    await fetch(`${API}/videos/${videoId}`, { method: 'DELETE' })
    setVideos(prev => prev.filter(v => v.video_id !== videoId))
    if (activeVideoId === videoId) {
      const remaining = videos.filter(v => v.video_id !== videoId)
      setActiveVideoId(remaining[0]?.video_id ?? null)
    }
  }

  function handlePin(text, source) {
    setNotes(prev => [...prev, { id: Date.now(), text, source }])
  }

  function handleDeleteNote(id) {
    setNotes(prev => prev.filter(n => n.id !== id))
  }

  function handleUpdateNote(id, text) {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, text } : n))
  }

  // Called by ChatPanel when user clicks a timestamp citation
  // Creates a new object every time so VideoPlayer's useEffect always fires,
  // even if the user clicks the same timestamp twice.
  function handleTimestampClick(videoId, seconds) {
    setActiveVideoId(videoId)
    setSeekTo({ videoId, seconds, _t: Date.now() })
  }

  // Landing page — shown until at least one video is loaded
  if (videos.length === 0) {
    return <LandingPage api={API} onVideosLoaded={handleVideosLoaded} />
  }

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-100">
      {/* Library strip */}
      <Library
        videos={videos}
        activeVideoId={activeVideoId}
        api={API}
        onSelect={handleSelectVideo}
        onRemove={handleRemoveVideo}
        onVideosAdded={handleVideosAdded}
      />

      {/* Main content: player (left) + panel (right) */}
      <div className="flex flex-1 min-h-0">
        {/* YouTube player */}
        <div className="w-1/2 bg-black flex items-center justify-center">
          <VideoPlayer
            videoId={activeVideoId}
            seekTo={seekTo}
          />
        </div>

        {/* Right panel: chat / study tabs */}
        <div className="w-1/2 flex flex-col border-l border-gray-800">
          {/* Tab bar */}
          <div className="flex border-b border-gray-800 shrink-0">
            <button
              onClick={() => setActiveTab('chat')}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                activeTab === 'chat'
                  ? 'text-white border-b-2 border-blue-500'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              💬 Chat
            </button>
            <button
              onClick={() => setActiveTab('study')}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                activeTab === 'study'
                  ? 'text-white border-b-2 border-blue-500'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              📖 Study
            </button>
            <button
              onClick={() => setActiveTab('notes')}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                activeTab === 'notes'
                  ? 'text-white border-b-2 border-blue-500'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              📝 Notes{notes.length > 0 && <span className="ml-1 text-xs text-blue-400">({notes.length})</span>}
            </button>
          </div>

          {/* Panel content — all rendered always so local state survives tab switches */}
          <div className={`flex flex-col flex-1 min-h-0 ${activeTab !== 'chat' ? 'hidden' : ''}`}>
            <ChatPanel
              api={API}
              videos={videos}
              onTimestampClick={handleTimestampClick}
              onPin={handlePin}
            />
          </div>
          <div className={`flex flex-col flex-1 min-h-0 ${activeTab !== 'study' ? 'hidden' : ''}`}>
            <StudyMode
              api={API}
              activeVideoId={activeVideoId}
              videos={videos}
              onPin={handlePin}
            />
          </div>
          <div className={`flex flex-col flex-1 min-h-0 ${activeTab !== 'notes' ? 'hidden' : ''}`}>
            <NotesPanel
              notes={notes}
              onDelete={handleDeleteNote}
              onUpdate={handleUpdateNote}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
