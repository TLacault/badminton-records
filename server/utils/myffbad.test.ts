import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  MyffbadScrapeError,
  normalisePlayer,
  parseSearchPage,
  rankBySearchPriority,
  splitName,
  toTitleCase,
} from './myffbad'

/**
 * The fixtures are unedited pages from myffbad.fr, saved on 2026-08-10. They
 * are the record of what the site looked like when the scraper last worked:
 * when these stop matching the live site, refresh them and fix the parser.
 *
 *   curl -o server/utils/__fixtures__/myffbad-search-lacault.html \
 *     'https://myffbad.fr/recherche/joueur?search=Tim+Lacault'
 */
const here = dirname(fileURLToPath(import.meta.url))
const fixture = (name: string) =>
  readFileSync(join(here, '__fixtures__', `myffbad-search-${name}.html`), 'utf-8')

describe('splitName', () => {
  it('splits the capitalised surname from the first name', () => {
    expect(splitName('Tim LACAULT')).toEqual({ firstName: 'Tim', lastName: 'LACAULT' })
  })

  it('keeps a multi-word surname together', () => {
    expect(splitName('Jean DE LA CROIX')).toEqual({
      firstName: 'Jean',
      lastName: 'DE LA CROIX',
    })
  })

  it('keeps a compound first name together', () => {
    expect(splitName('Marie Claire DUPONT')).toEqual({
      firstName: 'Marie Claire',
      lastName: 'DUPONT',
    })
  })

  it('treats an unsplittable name as a surname rather than guessing', () => {
    expect(splitName('MADONNA')).toEqual({ firstName: '', lastName: 'MADONNA' })
    expect(splitName('JEAN DUPONT')).toEqual({ firstName: '', lastName: 'JEAN DUPONT' })
    expect(splitName('  ')).toEqual({ firstName: '', lastName: '' })
  })
})

describe('toTitleCase', () => {
  it('calms a shouted surname', () => {
    expect(toTitleCase('LACAULT')).toBe('Lacault')
  })

  it('capitalises each part of a compound name', () => {
    expect(toTitleCase('JEAN-PIERRE')).toBe('Jean-Pierre')
    expect(toTitleCase("D'ARTAGNAN")).toBe("D'Artagnan")
  })

  it('keeps particles lower-case, except when they lead', () => {
    expect(toTitleCase('DE LA CROIX')).toBe('De la Croix')
    expect(toTitleCase('LE GALL')).toBe('Le Gall')
    expect(toTitleCase('VAN DEN BERG')).toBe('Van den Berg')
  })

  it('preserves accented letters', () => {
    expect(toTitleCase('MÜLLER')).toBe('Müller')
    expect(toTitleCase('LÉVÊQUE')).toBe('Lévêque')
  })
})

describe('normalisePlayer', () => {
  it('drops a row with no licence, since nothing can be filled from it', () => {
    expect(normalisePlayer({ PersonName: 'Tim LACAULT' })).toBeNull()
  })

  it('reads a rating that is not a number as absent', () => {
    const player = normalisePlayer({ PersonLicence: '1', GlobalRating: 'N/A' })
    expect(player?.cpph).toBeNull()
  })
})

describe('parseSearchPage', () => {
  it('reads every field of a single match', () => {
    const { players, total, maxPages } = parseSearchPage(fixture('lacault'))
    expect(total).toBe(1)
    expect(maxPages).toBe(1)
    expect(players[0]).toEqual({
      personId: '1553921',
      licence: '07667823',
      firstName: 'Tim',
      lastName: 'Lacault',
      clubId: '830',
      club: 'Union Sportive Talence Badminton',
      category: 'Senior',
      rankSingles: 'P11',
      rankDoubles: 'P11',
      rankMixed: 'P12',
      cpph: 1470,
    })
  })

  it('reports a full page of matches and how many pages follow', () => {
    const { players, total, maxPages } = parseSearchPage(fixture('martin'))
    expect(total).toBe(50)
    expect(players).toHaveLength(50)
    expect(maxPages).toBe(61)
    expect(players.every(p => p.licence !== '')).toBe(true)
  })

  it('reads a search that matched nobody as empty, not as a failure', () => {
    expect(parseSearchPage(fixture('none'))).toEqual({
      players: [],
      total: 0,
      maxPages: 0,
      rows: [],
    })
  })

  it('says the site changed when the page has neither results nor the empty notice', () => {
    expect(() => parseSearchPage('<html><body>Maintenance</body></html>'))
      .toThrow(MyffbadScrapeError)
  })
})

describe('rankBySearchPriority', () => {
  /** Real MyFFBaD rows: 50 people called Martin, from every club in France. */
  const crowd = () => parseSearchPage(fixture('martin')).players

  /**
   * Two clubs that genuinely appear in the fixture. Picking ids by hand — 830
   * is ours in real life — made the filter tests vacuous, because no Martin
   * plays for us: `shown` came back empty and every assertion about it passed
   * for the wrong reason.
   */
  const [top, second] = [...new Set(crowd().map(p => p.clubId))] as string[]
  const priorities = new Map([[top!, 100], [second!, 0]])

  it('has two real clubs to rank, or the tests below prove nothing', () => {
    const all = crowd()
    expect(all.filter(p => p.clubId === top).length).toBeGreaterThan(0)
    expect(all.filter(p => p.clubId === second).length).toBeGreaterThan(0)
  })

  it('shows only our clubs by default, and counts what it held back', () => {
    const all = crowd()
    const { shown, hidden } = rankBySearchPriority(all, priorities, 'local')

    expect(shown.length).toBeGreaterThan(0)
    expect(shown.length).toBeLessThan(all.length)
    expect(shown.every(p => p.priority !== null)).toBe(true)
    expect(shown.length + hidden).toBe(all.length)
  })

  it('puts the highest priority club first', () => {
    const players = crowd()
    // Borrow two real rows and place them in known clubs.
    const ours = { ...players[10]!, clubId: top!, lastName: 'Zzz', firstName: 'Zzz' }
    const neighbour = { ...players[11]!, clubId: second!, lastName: 'Aaa', firstName: 'Aaa' }

    const { shown } = rankBySearchPriority([neighbour, ours], priorities, 'local')
    // 'Zzz' sorts last alphabetically, so only priority can put it first.
    expect(shown.map(p => p.lastName)).toEqual(['Zzz', 'Aaa'])
  })

  it('falls back to surname order within one club', () => {
    const players = crowd()
    const b = { ...players[0]!, clubId: top!, lastName: 'Bernard' }
    const a = { ...players[1]!, clubId: top!, lastName: 'Andre' }

    const { shown } = rankBySearchPriority([b, a], priorities, 'local')
    expect(shown.map(p => p.lastName)).toEqual(['Andre', 'Bernard'])
  })

  it('keeps everyone when the search is broadened, unknown clubs last', () => {
    const all = crowd()
    const { shown, hidden } = rankBySearchPriority(all, priorities, 'all')

    expect(shown).toHaveLength(all.length)
    expect(hidden).toBe(all.length - shown.filter(p => p.priority !== null).length)

    // A player from an unlisted club can never outrank one of ours.
    const firstUnknown = shown.findIndex(p => p.priority === null)
    const lastKnown = shown.findLastIndex(p => p.priority !== null)
    expect(firstUnknown).toBeGreaterThan(-1)
    expect(lastKnown).toBeGreaterThan(-1)
    expect(firstUnknown).toBeGreaterThan(lastKnown)
  })

  it('treats a player with no club as unknown rather than crashing', () => {
    const orphan = { ...crowd()[0]!, clubId: null }
    expect(rankBySearchPriority([orphan], priorities, 'local').shown).toHaveLength(0)
    expect(rankBySearchPriority([orphan], priorities, 'all').shown).toHaveLength(1)
  })
})
