import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { BadisteScrapeError, parseClubList } from './badiste'

/**
 * An unedited page from badiste.fr, saved on 2026-08-10. Refresh it with:
 *
 *   curl -o server/utils/__fixtures__/badiste-clubs-33.html \
 *     'https://badiste.fr/liste-club-badminton/33-gironde.html'
 */
const here = dirname(fileURLToPath(import.meta.url))
const page = () =>
  new TextDecoder('iso-8859-15').decode(
    readFileSync(join(here, '__fixtures__', 'badiste-clubs-33.html')),
  )

describe('parseClubList', () => {
  it('reads every club in the department', () => {
    expect(parseClubList(page(), '33')).toHaveLength(58)
  })

  it('reads a club whose MyFFBaD id is the join key to a player row', () => {
    const clubs = parseClubList(page(), '33')
    expect(clubs.find(c => c.myffbadClubId === '830')).toEqual({
      myffbadClubId: '830',
      name: 'Union Sportive Talence Badminton',
      acronym: 'UST33',
      city: 'TALENCE',
      department: '33',
    })
  })

  it('decodes accents rather than mangling them', () => {
    const clubs = parseClubList(page(), '33')
    expect(clubs.map(c => c.city)).toContain('AMBARÈS-ET-LAGRAVE')
    expect(clubs.some(c => (c.name + c.city).includes('�'))).toBe(false)
  })

  it('keeps ids and acronyms unique, so either can identify a club', () => {
    const clubs = parseClubList(page(), '33')
    expect(new Set(clubs.map(c => c.myffbadClubId)).size).toBe(clubs.length)
    expect(new Set(clubs.map(c => c.acronym)).size).toBe(clubs.length)
  })

  it('says the site changed rather than reporting an empty department', () => {
    expect(() => parseClubList('<html><body>Maintenance</body></html>', '33'))
      .toThrow(BadisteScrapeError)
  })
})
