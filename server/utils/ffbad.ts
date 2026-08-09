/**
 * Client for the official FFBaD web services (https://apitest.ffbad.org/).
 *
 * REST convention, confirmed against the live endpoint:
 *   GET <base>?AuthJson={"Login","Password"}&QueryJson={"Function","Param"}
 * and every response is the envelope
 *   { Retour, Message, Code, Statut: 'OK' | 'KO', Trace }
 *
 * The envelope and the calling convention are verified. The field names INSIDE
 * `Retour` are not — they are undocumented and the endpoint refuses
 * unauthenticated calls, so `normalisePlayer` below guesses among the plausible
 * spellings. If a field comes back empty, call the search route with `debug=1`
 * to see the raw payload and correct the candidate lists in one place.
 */

export interface FfbadEnvelope<T = unknown> {
  Retour: T | ''
  Message: string
  Code: string
  Statut: 'OK' | 'KO'
  Trace: string
}

export interface FfbadPlayer {
  licence: string
  firstName: string
  lastName: string
  club: string | null
  birthYear: number | null
  rankSingles: string | null
  rankDoubles: string | null
  rankMixed: string | null
}

export class FfbadError extends Error {}

/** Case-insensitive lookup over a list of candidate keys. */
function pick(row: Record<string, unknown>, candidates: string[]): string | null {
  const lower = new Map(
    Object.entries(row).map(([k, v]) => [k.toLowerCase(), v]),
  )
  for (const key of candidates) {
    const value = lower.get(key.toLowerCase())
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value).trim()
    }
  }
  return null
}

/** Accepts a year, a date, or a full timestamp and yields the year. */
function toBirthYear(value: string | null): number | null {
  if (!value) return null
  const match = /(\d{4})/.exec(value)
  if (!match) return null
  const year = Number(match[1])
  return year >= 1900 && year <= 2100 ? year : null
}

/**
 * The one place that knows FFBaD's field names. Everything else works with
 * `FfbadPlayer`, so correcting a mapping never ripples outward.
 */
export function normalisePlayer(row: Record<string, unknown>): FfbadPlayer | null {
  const licence = pick(row, ['Licence', 'NumeroLicence', 'NoLicence', 'licence'])
  if (!licence) return null
  return {
    licence,
    firstName: pick(row, ['Prenom', 'PrenomLicencie', 'FirstName']) ?? '',
    lastName: pick(row, ['Nom', 'NomLicencie', 'LastName']) ?? '',
    club: pick(row, ['Club', 'NomClub', 'LibelleClub', 'ClubNom']),
    birthYear: toBirthYear(
      pick(row, ['AnneeNaissance', 'DateNaissance', 'DateDeNaissance', 'Naissance']),
    ),
    rankSingles: pick(row, ['ClassementSimple', 'CPPHSimple', 'Simple', 'CS']),
    rankDoubles: pick(row, ['ClassementDouble', 'CPPHDouble', 'Double', 'CD']),
    rankMixed: pick(row, ['ClassementMixte', 'CPPHMixte', 'Mixte', 'CM']),
  }
}

/** Retour may arrive as an array, a single object, or a JSON-encoded string. */
export function toRows(retour: unknown): Array<Record<string, unknown>> {
  if (!retour) return []
  let value = retour
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    }
    catch {
      return []
    }
  }
  if (Array.isArray(value)) return value as Array<Record<string, unknown>>
  if (typeof value === 'object') return [value as Record<string, unknown>]
  return []
}

export async function callFfbad<T = unknown>(
  options: { baseUrl: string, login: string, password: string },
  fn: string,
  param: Record<string, unknown>,
): Promise<FfbadEnvelope<T>> {
  const envelope = await $fetch<FfbadEnvelope<T>>(options.baseUrl, {
    query: {
      AuthJson: JSON.stringify({ Login: options.login, Password: options.password }),
      QueryJson: JSON.stringify({ Function: fn, Param: param }),
    },
  })

  // The API answers 200 with Statut 'KO' rather than an HTTP error status, so
  // failures have to be read out of the body.
  if (envelope.Statut !== 'OK') {
    throw new FfbadError(envelope.Message || `FFBaD call ${fn} failed`)
  }
  return envelope
}

/** Search licensees whose surname starts with `name`. */
export async function searchByName(
  options: { baseUrl: string, login: string, password: string },
  name: string,
) {
  const envelope = await callFfbad(options, 'ws_getlicenceinfobystartnom', {
    Nom: name,
    NotLastSeasonOnly: false,
  })
  const rows = toRows(envelope.Retour)
  return {
    raw: envelope.Retour,
    players: rows.map(normalisePlayer).filter((p): p is FfbadPlayer => p !== null),
  }
}
