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
      /**
       * Volume is 0–100 on YouTube's own scale, not 0–1. Optional because the
       * embed only gains these once it is ready, and calling into a player
       * mid-construction is how you get an undefined-is-not-a-function.
       */
      getVolume?: () => number
      setVolume?: (volume: number) => void
      isMuted?: () => boolean
      mute?: () => void
      unMute?: () => void
      getPlaybackRate?: () => number
      setPlaybackRate?: (rate: number) => void
      getAvailablePlaybackRates?: () => number[]
      /** Reports the level in use. Setting it is ignored by YouTube. */
      getPlaybackQuality?: () => string
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
