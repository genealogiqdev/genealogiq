import { createVideoPlayer } from 'expo-video'

/**
 * Length of a local video in seconds, read by loading it into a throwaway
 * player. Null when the device cannot tell within a few seconds.
 */
export function probeVideoDuration(uri: string): Promise<number | null> {
  return new Promise((resolve) => {
    let settled = false
    let cleanup = () => {}
    const finish = (value: number | null) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(value)
    }
    try {
      const player = createVideoPlayer(uri)
      const loaded = player.addListener('sourceLoad', ({ duration }) => finish(Number.isFinite(duration) && duration > 0 ? duration : null))
      const status = player.addListener('statusChange', ({ status: next }) => {
        if (next === 'error') finish(null)
      })
      const timer = setTimeout(() => finish(null), 8000)
      cleanup = () => {
        clearTimeout(timer)
        loaded.remove()
        status.remove()
        try {
          player.release()
        } catch {
          // Already released.
        }
      }
    } catch {
      finish(null)
    }
  })
}
