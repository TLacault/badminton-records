import type { RallyInput } from './types'

/**
 * Where a rally ending at `endedAtSeconds` belongs in the log.
 *
 * The log is ordered by video time, and the score is derived from that order,
 * so a point logged out of order corrupts every score after it. Appending is
 * only correct while tagging forwards in real time; re-watching to patch a
 * miscount produces a point that ended earlier than everything logged since,
 * and it has to slot in where it happened.
 *
 * Ties append after the existing rally: pressing twice at the same timestamp
 * keeps the presses in the order they were made.
 */
export function insertPositionFor(
  rallies: readonly RallyInput[],
  endedAtSeconds: number,
): number {
  const at = rallies.findIndex(r => r.endedAtSeconds > endedAtSeconds)
  return at === -1 ? rallies.length : at
}
