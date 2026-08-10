import type { SummaryRow } from './matchSummary'
import { describe, expect, it } from 'vitest'
import { outcomeOf, youtubeTitle } from './matchSummary'

function row(partial: Partial<SummaryRow> = {}): SummaryRow {
  return {
    title: 'Jeux Libres - raw upload name',
    format: 'doubles',
    ...partial,
  }
}

function at(slot: number, first: string, last = 'Somebody') {
  return { slot, players: { first_name: first, last_name: last } }
}

describe('youtubeTitle', () => {
  it('names the session, the format and the opponents', () => {
    const built = youtubeTitle(
      row({ match_players: [at(1, 'Tim'), at(2, 'Adrien'), at(3, 'Antho'), at(4, 'Gaspard')] }),
      'Free play',
    )
    expect(built).toBe('Free play - DH Antho x Gaspard')
  })

  it('leaves our own side out — it is the same every week', () => {
    const built = youtubeTitle(
      row({ match_players: [at(1, 'Tim'), at(2, 'Adrien'), at(3, 'Antho'), at(4, 'Gaspard')] }),
      'Free play',
    )
    expect(built).not.toContain('Tim')
    expect(built).not.toContain('Adrien')
  })

  it('marks a singles match SH', () => {
    const built = youtubeTitle(
      row({ format: 'singles', match_players: [at(1, 'Tim'), at(3, 'Antho')] }),
      'Free play',
    )
    expect(built).toBe('Free play - SH Antho')
  })

  it('keeps the stored title until an opponent is known', () => {
    expect(youtubeTitle(row(), 'Free play')).toBe('Jeux Libres - raw upload name')
    expect(youtubeTitle(row({ match_players: [at(1, 'Tim'), at(2, 'Adrien')] }), 'Free play'))
      .toBe('Jeux Libres - raw upload name')
  })

  it('drops the session prefix when the match has no type', () => {
    const built = youtubeTitle(row({ match_players: [at(3, 'Antho'), at(4, 'Gaspard')] }), null)
    expect(built).toBe('DH Antho x Gaspard')
  })

  it('uses the one opponent it has rather than waiting for the pair', () => {
    const built = youtubeTitle(row({ match_players: [at(3, 'Antho')] }), 'Free play')
    expect(built).toBe('Free play - DH Antho')
  })
})

describe('outcomeOf', () => {
  /** A minimal DerivedMatch: only the fields outcomeOf actually reads. */
  function derived(sets: (1 | 2 | null)[], complete = true, winner: 1 | 2 | null = 1) {
    return {
      sets: sets.map(winnerSide => ({ score: [15, 9] as [number, number], winnerSide })),
      complete,
      matchWinnerSide: winner,
    } as unknown as Parameters<typeof outcomeOf>[0]
  }

  it('counts sets won, ours first', () => {
    expect(outcomeOf(derived([1, 2, 1]))?.sets).toBe('2–1')
  })

  it('counts a clean sweep', () => {
    expect(outcomeOf(derived([1, 1]))?.sets).toBe('2–0')
  })

  it('reads a loss from our side, not the winner’s', () => {
    const outcome = outcomeOf(derived([2, 2], true, 2))
    expect(outcome?.sets).toBe('0–2')
    expect(outcome?.state).toBe('lost')
  })

  /**
   * The reason the tally counts winners rather than comparing points: a set
   * still in play has somebody ahead, and awarding it would show a result the
   * match has not reached.
   */
  it('does not award a set that is still being played', () => {
    const outcome = outcomeOf(derived([1, null], false, null))
    expect(outcome?.sets).toBe('1–0')
    expect(outcome?.state).toBe('unfinished')
  })

  it('has no tally before anything is tagged', () => {
    expect(outcomeOf(null)).toBeNull()
  })

  it('says so in words rather than showing 0-0 on an untagged match', () => {
    const outcome = outcomeOf(derived([], false, null))
    expect(outcome?.sets).toBe('0-0'.replace('-', '\u2013'))
    expect(outcome?.scoreLabel).toBe('In progress')
  })

  it('shows the tally once a set has actually been won', () => {
    expect(outcomeOf(derived([1, null], false, null))?.scoreLabel).toBe('1\u20130')
  })

  it('always shows the tally for a finished match', () => {
    expect(outcomeOf(derived([1, 2, 1]))?.scoreLabel).toBe('2\u20131')
  })
})
