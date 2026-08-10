import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { MyffbadScrapeError, normalisePlayer, parseSearchPage, splitName, toTitleCase } from './myffbad'

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
