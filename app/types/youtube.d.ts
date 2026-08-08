export {}

declare global {
  namespace YT {
    interface Player {
      playVideo: () => void
      pauseVideo: () => void
      seekTo: (seconds: number, allowSeekAhead: boolean) => void
      getCurrentTime: () => number
      getDuration: () => number
      getPlayerState: () => number
      destroy: () => void
    }
    interface PlayerEvent { target: Player }
    interface OnStateChangeEvent { target: Player, data: number }
  }

  interface Window {
    YT?: {
      Player: new (el: HTMLElement, options: {
        videoId?: string
        playerVars?: Record<string, string | number>
        events?: {
          onReady?: (e: YT.PlayerEvent) => void
          onStateChange?: (e: YT.OnStateChangeEvent) => void
        }
      }) => YT.Player
      PlayerState: { PLAYING: number, PAUSED: number, ENDED: number }
    }
    onYouTubeIframeAPIReady?: () => void
  }
}
