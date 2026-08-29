import type { ReelProject } from '~~/shared/reel'
import { describe, expect, it } from 'vitest'
import { emptyProject, makeClip } from '~~/shared/reel'
import { atempoChain, buildRenderPlan, escapeDrawtext } from './reelFfmpeg'

const source = { path: '/cache/source/abc.mp4', duration: 3600, hasAudio: true }

function project(overrides: Partial<ReelProject> = {}): ReelProject {
  return {
    ...emptyProject(),
    videoId: 'abcdefghijk',
    intro: false,
    outro: false,
    captions: false,
    fadeEdges: false,
    ...overrides,
  }
}

/** The args as one string, for asserting about the graph rather than the argv. */
function graph(args: string[]): string {
  return args[args.indexOf('-filter_complex') + 1] ?? ''
}

describe('buildRenderPlan', () => {
  it('refuses a reel with nothing in it', () => {
    expect(() => buildRenderPlan({
      project: project(),
      source,
      music: null,
      intro: null,
      outro: null,
      outputPath: '/out.mp4',
    })).toThrow(/no clips/)
  })

  it('seeks each clip on the input rather than trimming after the decode', () => {
    const plan = buildRenderPlan({
      project: project({ clips: [makeClip(10, 20), makeClip(100, 104)] }),
      source,
      music: null,
      intro: null,
      outro: null,
      outputPath: '/out.mp4',
    })

    expect(plan.args.join(' ')).toContain('-ss 10 -to 20 -i /cache/source/abc.mp4')
    expect(plan.args.join(' ')).toContain('-ss 100 -to 104 -i /cache/source/abc.mp4')
  })

  it('gives back the transition at every join, so the reel is not the sum of its clips', () => {
    const clips = [makeClip(0, 10), makeClip(20, 30), makeClip(40, 50)]
    const cut = buildRenderPlan({
      project: project({ clips, transition: 'cut' }),
      source,
      music: null,
      intro: null,
      outro: null,
      outputPath: '/out.mp4',
    })
    const faded = buildRenderPlan({
      project: project({ clips, transition: 'crossfade', transitionSeconds: 0.5 }),
      source,
      music: null,
      intro: null,
      outro: null,
      outputPath: '/out.mp4',
    })

    expect(cut.duration).toBe(30)
    expect(faded.duration).toBe(29)
    expect(graph(cut.args)).toContain('concat=n=3:v=1:a=1')
    // Second join is offset by the length of the first two clips less one overlap.
    expect(graph(faded.args)).toContain('offset=9.5')
    expect(graph(faded.args)).toContain('offset=19')
  })

  it('stretches a slow-motion clip in both picture and sound', () => {
    const plan = buildRenderPlan({
      project: project({ clips: [makeClip(0, 8, { speed: 0.5 })] }),
      source,
      music: null,
      intro: null,
      outro: null,
      outputPath: '/out.mp4',
    })

    expect(plan.duration).toBe(16)
    expect(graph(plan.args)).toContain('setpts=2*PTS')
    expect(graph(plan.args)).toContain('atempo=0.5')
  })

  it('lays a silent bookend on a synthetic track rather than an empty pad', () => {
    const plan = buildRenderPlan({
      project: project({ clips: [makeClip(0, 5)], intro: true }),
      source,
      music: null,
      intro: { path: '/public/reel/intro.mp4', duration: 3, hasAudio: false },
      outro: null,
      outputPath: '/out.mp4',
    })

    expect(graph(plan.args)).toContain('anullsrc')
    expect(plan.duration).toBe(7.6)
  })

  it('trims the song to the film and fades it out at the end', () => {
    const plan = buildRenderPlan({
      project: project({
        clips: [makeClip(0, 10)],
        music: { ...emptyProject().music, kind: 'youtube', videoId: 'zzzzzzzzzzz', startAt: 42, fadeOutSeconds: 2 },
      }),
      source,
      music: { path: '/cache/music/zzz.m4a', duration: 200, hasAudio: true },
      intro: null,
      outro: null,
      outputPath: '/out.mp4',
    })

    expect(plan.args.join(' ')).toContain('-ss 42 -i /cache/music/zzz.m4a')
    expect(graph(plan.args)).toContain('atrim=0:10')
    expect(graph(plan.args)).toContain('afade=t=out:st=8:d=2')
    expect(graph(plan.args)).toContain('amix=inputs=2')
  })
})

describe('escapeDrawtext', () => {
  it('leaves alone everything quoting and expansion=none already cover', () => {
    expect(escapeDrawtext('Set 2 · 15:12, 100%')).toBe('Set 2 · 15:12, 100%')
  })

  it('closes, escapes and reopens the quote around an apostrophe', () => {
    expect(escapeDrawtext("Tim's point")).toBe(String.raw`Tim'\''s point`)
  })
})

describe('atempoChain', () => {
  it('chains past the filter\'s own limits', () => {
    expect(atempoChain(1)).toEqual([])
    expect(atempoChain(0.5)).toEqual(['atempo=0.5'])
    expect(atempoChain(0.25)).toEqual(['atempo=0.5', 'atempo=0.5'])
    expect(atempoChain(2)).toEqual(['atempo=2'])
  })
})
