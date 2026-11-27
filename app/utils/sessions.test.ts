import { describe, expect, it } from 'vitest'
import { withSource } from './matchSummary'
import { groupBySession, splitKinds } from './sessions'

const row = (over: Record<string, unknown>) => ({
  played_on: '2026-11-07', venue: 'Gradignan', youtube_duration_seconds: 600,
  video_kind: 'match', source_match_id: null, event_name: null, match_types: null, ...over,
})

describe('sessions', () => {
  it('counts played matches only, and names a tournament day after its event', () => {
    const [day] = groupBySession([
      row({ video_kind: 'edit', venue: 'Talence' }),
      row({ match_types: { slug: 'tournament' }, event_name: 'Tournois Senior' }),
      row({ source_match_id: 'raw' }),
      row({ video_kind: 'highlights' }),
      row({ video_kind: 'edit' }),
    ])
    expect(day!.matchCount).toBe(1)
    expect(day!.totalSeconds).toBe(600)
    expect(day!.eventName).toBe('Tournois Senior')
    expect(splitKinds(day!.matches).extras).toHaveLength(3)
    expect(day!.venue).toBe('Gradignan')
  })

  it('a linked video takes its source match\'s data and day', () => {
    const [linked] = withSource([{ id: 'h', played_on: '2026-11-09', source: { played_on: '2026-11-07', venue: 'Gradignan' } }])
    expect(linked).toMatchObject({ id: 'h', played_on: '2026-11-07', venue: 'Gradignan' })
  })
})
