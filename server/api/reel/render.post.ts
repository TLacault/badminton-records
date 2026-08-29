import type { ReelProject } from '~~/shared/reel'
import { join } from 'node:path'
import { activeClips, emptyProject, GRADES, SPEEDS, TRANSITIONS } from '~~/shared/reel'
import {
  BOOKENDS,
  capabilities,
  exists,
  musicPath,
  OUT_DIR,
  parseVideoId,
  probe,
  renderName,
  run,
  sourcePath,
  startJob,
} from '../../utils/reel'
import { buildRenderPlan } from '../../utils/reelFfmpeg'

/**
 * Cuts the reel.
 *
 * The project arrives from a browser, so none of it is trusted: every number
 * is clamped to a range the filter graph can survive and every caption is cut
 * back to plain text. Nothing here reaches a shell — ffmpeg is spawned with an
 * argv — but a filtergraph is its own little language, and a caption is the one
 * field a stranger writes into it.
 */

const clamp = (value: unknown, min: number, max: number, fallback: number) => {
  const n = Number(value)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}

function sanitise(raw: Partial<ReelProject>): ReelProject {
  const base = emptyProject()
  const clips = (raw.clips ?? []).slice(0, 200).map((clip, i) => ({
    id: `c${i}`,
    from: clamp(clip.from, 0, 86_400, 0),
    to: clamp(clip.to, 0, 86_400, 0),
    enabled: clip.enabled !== false,
    speed: SPEEDS.includes(Number(clip.speed)) ? Number(clip.speed) : 1,
    zoom: clamp(clip.zoom, 1, 3, 1),
    grade: GRADES.includes(clip.grade!) ? clip.grade! : 'none',
    showLabel: clip.showLabel !== false,
    // Newlines and the filtergraph's own separators never belong in a caption,
    // whatever the person typing them had in mind.
    label: String(clip.label ?? '').replace(/[\r\n;\\]/g, ' ').slice(0, 120),
    rallyIdx: clip.rallyIdx ?? null,
    score: clip.score ? String(clip.score).slice(0, 24) : null,
    setNumber: clip.setNumber ?? null,
  }))

  return {
    ...base,
    name: String(raw.name ?? base.name).slice(0, 120),
    matchId: raw.matchId ?? null,
    videoId: raw.videoId ?? null,
    matchTitle: String(raw.matchTitle ?? '').slice(0, 160),
    clips: clips.filter(c => c.to > c.from),
    music: {
      ...base.music,
      ...raw.music,
      videoId: raw.music?.videoId ?? null,
      startAt: clamp(raw.music?.startAt, 0, 36_000, 0),
      volume: clamp(raw.music?.volume, 0, 2, 0.85),
      fadeInSeconds: clamp(raw.music?.fadeInSeconds, 0, 10, 1.2),
      fadeOutSeconds: clamp(raw.music?.fadeOutSeconds, 0.05, 10, 2),
    },
    transition: TRANSITIONS.includes(raw.transition!) ? raw.transition! : 'crossfade',
    transitionSeconds: clamp(raw.transitionSeconds, 0.05, 3, 0.4),
    intro: raw.intro !== false,
    outro: raw.outro !== false,
    fadeEdges: raw.fadeEdges !== false,
    captions: raw.captions !== false,
    output: {
      height: ([720, 1080, 1440].includes(Number(raw.output?.height)) ? Number(raw.output?.height) : 1080) as 720 | 1080 | 1440,
      fps: (Number(raw.output?.fps) === 60 ? 60 : 30) as 30 | 60,
      matchAudio: clamp(raw.output?.matchAudio, 0, 2, 0.35),
    },
  }
}

export default defineEventHandler(async (event) => {
  const body = await readBody<{ project?: Partial<ReelProject> }>(event)
  const project = sanitise(body?.project ?? {})

  const caps = await capabilities()
  if (!caps.render) {
    throw createError({ statusCode: 501, statusMessage: 'This host has no ffmpeg, so it cannot render' })
  }

  const videoId = parseVideoId(project.videoId ?? '')
  if (!videoId) throw createError({ statusCode: 400, statusMessage: 'The project has no match video' })
  if (!activeClips(project).length) {
    throw createError({ statusCode: 400, statusMessage: 'The reel has no clips' })
  }

  const sourceFile = sourcePath(videoId)
  if (!await exists(sourceFile)) {
    throw createError({
      statusCode: 409,
      statusMessage: 'The match video is not downloaded yet',
    })
  }

  const music = project.music.videoId ? musicPath(project.music.videoId) : null
  const [source, musicFacts, intro, outro] = await Promise.all([
    probe(sourceFile),
    music && await exists(music) ? probe(music) : null,
    project.intro && await exists(BOOKENDS.intro) ? probe(BOOKENDS.intro) : null,
    project.outro && await exists(BOOKENDS.outro) ? probe(BOOKENDS.outro) : null,
  ])

  // Named after the edit rather than after the moment: exporting the same reel
  // twice is a download, not a re-render.
  const name = renderName({ project, source: source.duration, music: musicFacts?.duration ?? null })
  const outputPath = join(OUT_DIR, `${name}.mp4`)

  const plan = buildRenderPlan({
    project,
    source,
    music: musicFacts,
    intro,
    outro,
    outputPath,
  })

  if (await exists(outputPath)) {
    return { ready: true, name, duration: plan.duration, job: null }
  }

  const job = startJob('render', `render:${name}`, async (report) => {
    report(0, 'Starting the render')
    await run('ffmpeg', plan.args, report, plan.duration)
    return { name, duration: plan.duration }
  })

  return { ready: false, name, duration: plan.duration, job }
})
