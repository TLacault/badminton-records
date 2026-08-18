import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MyffbadScrapeError,
  normalisePlayer,
  parseSearchPage,
  HOME_CLUB_QUERY,
  rankBySearchPriority,
  searchPlayers,
  sortByName,
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
   * is ours in real life — made the ranking tests vacuous, because no Martin
   * plays for us: every row scored the same and the assertions passed for the
   * wrong reason.
   */
  const [top, second] = [...new Set(crowd().map(p => p.clubId))] as string[]
  const priorities = new Map([[top!, 100], [second!, 0]])

  it('has two real clubs to rank, or the tests below prove nothing', () => {
    const all = crowd()
    expect(all.filter(p => p.clubId === top).length).toBeGreaterThan(0)
    expect(all.filter(p => p.clubId === second).length).toBeGreaterThan(0)
  })

  it('keeps everyone, unknown clubs last', () => {
    const all = crowd()
    const ranked = rankBySearchPriority(all, priorities)

    expect(ranked).toHaveLength(all.length)

    // A player from an unlisted club can never outrank one of ours.
    const firstUnknown = ranked.findIndex(p => p.priority === null)
    const lastKnown = ranked.findLastIndex(p => p.priority !== null)
    expect(firstUnknown).toBeGreaterThan(-1)
    expect(lastKnown).toBeGreaterThan(-1)
    expect(firstUnknown).toBeGreaterThan(lastKnown)
  })

  it('puts the highest priority club first', () => {
    const players = crowd()
    // Borrow two real rows and place them in known clubs.
    const ours = { ...players[10]!, clubId: top!, lastName: 'Zzz', firstName: 'Zzz' }
    const neighbour = { ...players[11]!, clubId: second!, lastName: 'Aaa', firstName: 'Aaa' }

    const ranked = rankBySearchPriority([neighbour, ours], priorities)
    // 'Zzz' sorts last alphabetically, so only priority can put it first.
    expect(ranked.map(p => p.lastName)).toEqual(['Zzz', 'Aaa'])
  })

  it('falls back to surname order within one club', () => {
    const players = crowd()
    const b = { ...players[0]!, clubId: top!, lastName: 'Bernard' }
    const a = { ...players[1]!, clubId: top!, lastName: 'Andre' }

    const ranked = rankBySearchPriority([b, a], priorities)
    expect(ranked.map(p => p.lastName)).toEqual(['Andre', 'Bernard'])
  })

  it('treats a player with no club as unknown rather than crashing', () => {
    const orphan = { ...crowd()[0]!, clubId: null }
    const ranked = rankBySearchPriority([orphan], priorities)
    expect(ranked).toHaveLength(1)
    expect(ranked[0]!.priority).toBeNull()
  })
})

describe('sortByName', () => {
  it('orders one club by surname, then first name', () => {
    const [a, b, c] = crowdish()
    expect(sortByName([c!, a!, b!]).map(p => `${p.lastName} ${p.firstName}`))
      .toEqual(['Andre Zoe', 'Bernard Alice', 'Bernard Bob'])
  })

  /** Three rows from the fixture, renamed so the order under test is obvious. */
  function crowdish() {
    const rows = parseSearchPage(fixture('martin')).players
    return [
      { ...rows[0]!, lastName: 'Andre', firstName: 'Zoe' },
      { ...rows[1]!, lastName: 'Bernard', firstName: 'Alice' },
      { ...rows[2]!, lastName: 'Bernard', firstName: 'Bob' },
    ]
  }
})

describe('searchPlayers', () => {
  afterEach(() => vi.unstubAllGlobals())

  /** Records what the scraper asked MyFFBaD for, and answers with a fixture. */
  function record(page: string) {
    const calls: { url: string, query: Record<string, string> }[] = []
    vi.stubGlobal('$fetch', (url: string, options: { query: Record<string, string> }) => {
      calls.push({ url, query: options.query })
      return Promise.resolve(page)
    })
    return calls
  }

  it('asks for our club alone, the way the site\'s own filter does', async () => {
    const calls = record(fixture('lacault'))
    await searchPlayers('lacault')

    expect(calls[0]!.url).toBe('https://myffbad.fr/recherche/joueur')
    expect(calls[0]!.query).toEqual({
      isFirstLoad: 'false',
      search: 'lacault',
      ...HOME_CLUB_QUERY,
    })
  })

  it('drops every filter when the search goes national', async () => {
    const calls = record(fixture('martin'))
    const { players } = await searchPlayers('martin', 'all')

    expect(calls[0]!.query).toEqual({ search: 'martin' })
    expect(players).toHaveLength(50)
  })
})
