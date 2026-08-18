import { describe, expect, it } from 'vitest'
import { rankOrder, shortName, sortPlayers } from './players'

/** Only the fields the sort reads; the roster row has many more. */
function player(
  first: string,
  last: string,
  extra: Partial<{ club: string | null, rank_singles: string | null, rank_doubles: string | null, rank_mixed: string | null }> = {},
) {
  return { first_name: first, last_name: last, ...extra }
}

describe('rankOrder', () => {
  it('orders the whole ladder best to worst', () => {
    const ladder = ['N1', 'N3', 'R4', 'R6', 'D7', 'D9', 'P10', 'P12']
    const values = ladder.map(rankOrder)
    expect(values).toEqual([...values].sort((a, b) => a - b))
  })

  it('puts anything off the ladder after every rank', () => {
    expect(rankOrder('NC')).toBe(Number.POSITIVE_INFINITY)
    expect(rankOrder('')).toBe(Number.POSITIVE_INFINITY)
    expect(rankOrder(null)).toBe(Number.POSITIVE_INFINITY)
  })
})

describe('sortPlayers', () => {
  const roster = [
    player('Zoe', 'Adam', { club: 'Bordeaux', rank_doubles: 'D8' }),
    player('Alice', 'Zulu', { club: 'USTalence', rank_doubles: 'R6' }),
    player('Bob', 'Martin', { club: null, rank_doubles: null }),
  ]

  const names = (rows: typeof roster) => rows.map(p => `${p.first_name} ${p.last_name}`)

  it('sorts by the name the table prints, both ways', () => {
    expect(names(sortPlayers(roster, 'name', 'asc')))
      .toEqual(['Alice Zulu', 'Bob Martin', 'Zoe Adam'])
    expect(names(sortPlayers(roster, 'name', 'desc')))
      .toEqual(['Zoe Adam', 'Bob Martin', 'Alice Zulu'])
  })

  it('sorts by rank, best first', () => {
    expect(names(sortPlayers(roster, 'rank_doubles', 'asc')))
      .toEqual(['Alice Zulu', 'Zoe Adam', 'Bob Martin'])
  })

  it('keeps the unranked at the bottom when the column is reversed', () => {
    const rows = names(sortPlayers(roster, 'rank_doubles', 'desc'))
    expect(rows).toEqual(['Zoe Adam', 'Alice Zulu', 'Bob Martin'])
  })

  it('keeps players with no club at the bottom either way', () => {
    expect(names(sortPlayers(roster, 'club', 'asc')).at(-1)).toBe('Bob Martin')
    expect(names(sortPlayers(roster, 'club', 'desc')).at(-1)).toBe('Bob Martin')
  })

  it('breaks ties on the name, and leaves the input alone', () => {
    const tied = [
      player('Bob', 'Same', { rank_singles: 'D7' }),
      player('Alice', 'Same', { rank_singles: 'D7' }),
    ]
    expect(names(sortPlayers(tied, 'rank_singles', 'desc')))
      .toEqual(['Alice Same', 'Bob Same'])
    expect(names(tied)).toEqual(['Bob Same', 'Alice Same'])
  })
})

describe('shortName', () => {
  it('keeps the first name and initials the surname', () => {
    expect(shortName('Tim Lacault')).toBe('Tim L.')
    expect(shortName('Marie Claire Dupont')).toBe('Marie Claire D.')
  })

  it('leaves a name it cannot split alone', () => {
    expect(shortName('Slot 3')).toBe('Slot 3')
    expect(shortName('Madonna')).toBe('Madonna')
    expect(shortName('  ')).toBe('')
  })
})
