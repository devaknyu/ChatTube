/*
  VideoPlayer.jsx — YouTube iframe player with programmatic seek support.

  HOW SEEKING WORKS:
    The parent (App.jsx) passes a `seekTo` prop: { videoId, seconds, _t: timestamp }.
    We watch this prop in a useEffect. When it changes:
      1. If the videoId matches the current player, call playerRef.current.seekTo(seconds)
      2. The parent already set activeVideoId before setting seekTo, so by the time this
         effect fires the player is already loading the right video via the `videoId` prop.
         We still guard with videoId === seekTo.videoId to avoid seeking the wrong video
         on the brief moment between video switch and player ready.

    Why the _t field?
      React compares objects by reference, not value. If the user clicks the same timestamp
      twice, { videoId: "x", seconds: 30 } === { videoId: "x", seconds: 30 } is FALSE
      by reference — a new object always triggers the effect. But if the state were a
      primitive (just seconds), clicking the same value twice would NOT trigger the effect
      because the primitive hasn't changed. The _t: Date.now() hack is one way to handle
      this; creating a new object each time achieves the same thing here since objects
      are compared by reference.

  react-youtube opts:
    - playerVars.autoplay=1: start playing immediately when video switches
    - width/height "100%": fill the container div in App.jsx
*/

import { useEffect, useRef } from 'react'
import YouTube from 'react-youtube'

export default function VideoPlayer({ videoId, seekTo }) {
  const playerRef = useRef(null)

  // Seek whenever the parent sends a new seekTo signal
  useEffect(() => {
    if (!seekTo || !playerRef.current) return
    if (seekTo.videoId !== videoId) return  // guard: still loading the right video

    playerRef.current.seekTo(seekTo.seconds, true)
    playerRef.current.playVideo()
  }, [seekTo, videoId])

  if (!videoId) {
    return (
      <div className="text-gray-600 text-sm">No video selected</div>
    )
  }

  return (
    <YouTube
      videoId={videoId}
      onReady={e => { playerRef.current = e.target }}
      opts={{
        width: '100%',
        height: '100%',
        playerVars: {
          autoplay: 1,
          modestbranding: 1,
          rel: 0,
        },
      }}
      className="w-full h-full"
      iframeClassName="w-full h-full"
    />
  )
}
