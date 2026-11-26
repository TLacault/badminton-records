import type { BoardState, Corner, RenderRequest } from '~~/shared/publish'
import { requireAdmin } from '../../utils/auth'
import { hasHyperframes, renderPublish, sanitiseVars, sourceFacts } from '../../utils/publish'
import { capabilities, exists, parseVideoId, sourcePath, startJob } from '../../utils/reel'

/**
 * Renders the YouTube version of a match from its local original.
 *
 * The edit is computed in the browser (shared/publish, the same code the
 * preview uses) and re-checked here: numbers clamped, text cut to plain lines.
 * Text only ever reaches HyperFrames as JSON variables and ffmpeg as a file
 * path, never a shell or a filtergraph.
 */

const num = (v: unknown, min: number, max: number, fallback = min) => {
  const x = Number(v)
  return Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : fallback
}
const text = (v: unknown, max = 160) => String(v ?? '').replace(/[\r\n\t]/g, ' ').slice(0, max)
const DAY = 86_400
const span = (s: { from?: unknown, to?: unknown }) => ({ from: num(s.from, 0, DAY), to: num(s.to, 0, DAY) })
const vars = sanitiseVars
const board = (b: Partial<BoardState>): BoardState => ({
  sets: (b.sets ?? []).slice(0, 5).map(s => [num(s?.[0], 0, 99), num(s?.[1], 0, 99)] as [number, number]),
  serving: b.serving === 1 || b.serving === 2 ? b.serving : null,
  winner: b.winner === 1 || b.winner === 2 ? b.winner : null,
})

function sanitise(raw: Partial<RenderRequest>): RenderRequest {
  const p = (raw.plan ?? {}) as Partial<RenderRequest['plan']>
  const corner: Corner = (['tl', 'tr', 'bl', 'br'] as const).includes(raw.corner as Corner) ? raw.corner as Corner : 'tl'
  const crop = raw.crop
    ? { x: num(raw.crop.x, 0, 1), y: num(raw.crop.y, 0, 1), w: num(raw.crop.w, 0.1, 1, 1), h: num(raw.crop.h, 0.1, 1, 1) }
    : null
  if (crop) {
    crop.w = Math.min(crop.w, 1 - crop.x)
    crop.h = Math.min(crop.h, 1 - crop.y)
  }
  return {
    matchId: text(raw.matchId, 64).replace(/[^\w-]/g, ''),
    videoId: text(raw.videoId, 64),
    plan: {
      segments: (p.segments ?? []).slice(0, 500).map(span).filter(s => s.to > s.from),
      transitions: (p.transitions ?? []).slice(0, 100).map(t => ({
        at: num(t.at, 0, DAY),
        kind: t.kind === 'break' ? 'break' : 'set',
        title: text(t.title, 40),
        score: text(t.score, 20),
      })),
      scores: (p.scores ?? []).slice(0, 2000).map(s => ({ ...span(s), board: Math.round(num(s.board, 0, 319)) })),
      boards: (p.boards ?? []).slice(0, 320).map(board),
      outroClips: (p.outroClips ?? []).slice(0, 50).map(span).filter(s => s.to > s.from),
      outroSpeed: num(p.outroSpeed, 0.25, 1, 1),
      bodyDuration: num(p.bodyDuration, 0, DAY),
    },
    intro: vars(raw.intro),
    outro: vars(raw.outro),
    colour: /^#[0-9a-f]{6}$/i.test(String(raw.colour)) ? String(raw.colour) : '#cb2543',
    corner,
    sides: [text(raw.sides?.[0], 60), text(raw.sides?.[1], 60)],
    crop,
    outputHeight: [720, 1080, 1440, 2160].includes(Number(raw.outputHeight)) ? Number(raw.outputHeight) : null,
    draft: raw.draft === true,
    title: text(raw.title, 100),
    description: String(raw.description ?? '').slice(0, 5000),
  }
}

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const req = sanitise(await readBody<Partial<RenderRequest>>(event))
  const videoId = parseVideoId(req.videoId)
  if (!req.matchId || !videoId) throw createError({ statusCode: 400, statusMessage: 'A match and its video are required' })

  if (!(await capabilities()).render || !(await hasHyperframes())) {
    throw createError({ statusCode: 501, statusMessage: 'This host cannot render: it needs ffmpeg and the HyperFrames CLI (run it locally)' })
  }
  const path = sourcePath(videoId)
  if (!(await exists(path))) {
    throw createError({ statusCode: 409, statusMessage: 'Attach the original video file first' })
  }

  const source = await sourceFacts(path)
  const job = startJob('publish', `publish:${req.matchId}:${req.draft}`, async (report) => {
    const out = await renderPublish(req, source, report)
    return out
  })
  return { job }
})
