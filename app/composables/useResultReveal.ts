/**
 * Whether this visitor has asked to see how a match ended.
 *
 * The archive is full of matches nobody has watched yet, and a result printed
 * above the player spoils the twenty minutes underneath it. So the outcome —
 * and the final score in the details panel — stays blurred until asked for.
 *
 * Per match, and remembered: once you know, being asked again is noise. The
 * timeline under the video is deliberately not covered by this; it is the
 * navigation control, and blurring it would make the page unusable.
 */
export function useResultReveal(matchId: string) {
  const key = `ust-result-revealed:${matchId}`
  const revealed = ref(false)

  onMounted(() => {
    try {
      revealed.value = localStorage.getItem(key) === '1'
    }
    catch {
      // Storage denied: every visit simply starts hidden.
    }
  })

  function reveal() {
    revealed.value = true
    try {
      localStorage.setItem(key, '1')
    }
    catch {
      // Not worth failing the click over.
    }
  }

  return { revealed, reveal }
}
