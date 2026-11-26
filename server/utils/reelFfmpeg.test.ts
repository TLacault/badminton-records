import type { ReelProject } from '~~/shared/reel'
import { describe, expect, it } from 'vitest'
import { emptyProject, makeClip } from '~~/shared/reel'
import { atempoChain, buildRenderPlan } from './reelFfmpeg'

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
  it('lays each landscape clip into the vertical frame at its window', () => {
    const plan = buildRenderPlan({
      project: project({ clips: [makeClip(10, 20)] }),
      source,
      music: null,
      intro: null,
      outro: null,
      frame: '/hf/short-frame.mp4',
      outputPath: '/out.mp4',
    })
    expect(plan.args.join(' ')).toContain('-stream_loop -1 -t 10 -i /hf/short-frame.mp4')
    // 1080 wide: the clip is 1080×608 and sits 560 px down a 1080×1920 frame.
    expect(graph(plan.args)).toContain('scale=1080:608:force_original_aspect_ratio=increase')
    expect(graph(plan.args)).toContain('scale=1080:1920')
    expect(graph(plan.args)).toContain('overlay=0:560:shortest=1')
  })

  it('builds the frame in on the first clip and plays it backwards at the end of the last', () => {
    const plan = buildRenderPlan({
      project: project({ clips: [makeClip(10, 20), makeClip(30, 40)] }),
      source, music: null, intro: null, outro: null,
      frame: '/hf/short-frame.mp4',
      frameIn: '/hf/short-frame-in.mp4',
      outputPath: '/out.mp4',
    })
    const g = graph(plan.args)
    expect(plan.args.filter(a => a === '/hf/short-frame-in.mp4')).toHaveLength(2)
    expect(g).toMatch(/\[f0\]\[fin0\]overlay=0:0:eof_action=pass/)
    // Second clip is 10 s: the reversed build starts 1.4 s before its end.
    expect(g).toContain('reverse,')
    expect(g).toContain('setpts=PTS-STARTPTS+8.6/TB[fout1]')
    expect(g).not.toContain('fin1')
  })

  it('lays the full video scoreboard over each clip when the score is printed', () => {
    const plan = buildRenderPlan({
      project: project({ captions: true, orientation: 'landscape', clips: [makeClip(10, 20)] }),
      source, music: null, intro: null, outro: null,
      scoreLists: ['/out/x-score0.ffconcat'],
      outputPath: '/out.mp4',
    })
    expect(plan.args.join(' ')).toContain('-f concat -safe 0 -i /out/x-score0.ffconcat')
    expect(graph(plan.args)).toContain('scale=1920:1080,format=rgba[s0]')
    expect(graph(plan.args)).toContain('[c0][s0]overlay=0:0:eof_action=repeat')
  })

  it('loops a song shorter than the reel, and only then', () => {
    const run = (loop: boolean, songSeconds: number) => buildRenderPlan({
      project: project({ clips: [makeClip(10, 40)], music: { ...project().music, videoId: 'abcdefghijk', loop } }),
      source, intro: null, outro: null,
      music: { path: '/song.m4a', duration: songSeconds, hasAudio: true },
      outputPath: '/out.mp4',
    }).args.join(' ')
    expect(run(true, 20)).toContain('-stream_loop -1 -ss 0 -i /song.m4a')
    expect(run(true, 200)).not.toContain('-stream_loop')
    expect(run(false, 20)).not.toContain('-stream_loop')
  })

  it('pads to black bands without a frame', () => {
    const plan = buildRenderPlan({ project: project({ clips: [makeClip(10, 20)] }), source, music: null, intro: null, outro: null, outputPath: '/out.mp4' })
    expect(graph(plan.args)).toContain('pad=1080:1920:0:560:color=black')
  })

  it('fills a 16:9 picture in landscape, with no frame or bands', () => {
    const plan = buildRenderPlan({
      project: project({ orientation: 'landscape', clips: [makeClip(10, 20)] }),
      source, music: null, intro: null, outro: null,
      frame: '/hf/short-frame.mp4',
      outputPath: '/out.mp4',
    })
    expect(graph(plan.args)).toContain('scale=1920:1080:force_original_aspect_ratio=increase')
    expect(graph(plan.args)).not.toMatch(/overlay|pad=/)
    expect(plan.args.join(' ')).not.toContain('short-frame')
  })

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

describe('atempoChain', () => {
  it('chains past the filter\'s own limits', () => {
    expect(atempoChain(1)).toEqual([])
    expect(atempoChain(0.5)).toEqual(['atempo=0.5'])
    expect(atempoChain(0.25)).toEqual(['atempo=0.5', 'atempo=0.5'])
    expect(atempoChain(2)).toEqual(['atempo=2'])
  })
})
