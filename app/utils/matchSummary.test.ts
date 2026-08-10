import type { SummaryRow } from './matchSummary'
import { describe, expect, it } from 'vitest'
import { youtubeTitle } from './matchSummary'

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
