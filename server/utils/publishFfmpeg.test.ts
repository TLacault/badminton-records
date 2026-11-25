import { describe, expect, it } from 'vitest'
import { bodyArgs, frameFilter, outputFrame, stillsList } from './publishFfmpeg'

const SRC = { path: '/src.mp4', width: 3840, height: 2160, fps: '60/1', duration: 600, hasAudio: true }

describe('publishFfmpeg', () => {
  it('keeps 16:9, even sides, never above the cropped source', () => {
    expect(outputFrame(SRC, null, null)).toEqual({ width: 3840, height: 2160, fps: '60/1' })
    expect(outputFrame(SRC, { x: 0.1, y: 0.1, w: 0.5, h: 0.5 }, 1440)).toEqual({ width: 1920, height: 1080, fps: '60/1' })
    expect(outputFrame(SRC, null, 720)).toEqual({ width: 1280, height: 720, fps: '60/1' })
  })

  it('crops in source proportions then fills the frame', () => {
    expect(frameFilter({ x: 0.1, y: 0, w: 0.8, h: 0.8 }, { width: 1920, height: 1080, fps: '30/1' }))
      .toBe('crop=iw*0.8:ih*0.8:iw*0.1:ih*0,scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setsar=1,fps=30/1')
  })

  it('holds the last still for its duration', () => {
    expect(stillsList([{ path: '/a.png', seconds: 2 }, { path: "/it's.png", seconds: 3.5 }]))
      .toBe("ffconcat version 1.0\nfile '/a.png'\nduration 2\nfile '/it'\\''s.png'\nduration 3.5\nfile '/it'\\''s.png'\n")
  })

  it('joins segments, lays the board and the stings, and a whoosh under each sting', () => {
    const args = bodyArgs({
      source: SRC,
      segments: [{ from: 0, to: 30 }, { from: 90, to: 200 }],
      crop: null,
      frame: { width: 1920, height: 1080, fps: '60/1' },
      scoreList: '/scores.ffconcat',
      transitions: [{ path: '/t.mov', at: 29 }],
      whoosh: '/w.wav',
      enc: { draft: true },
      out: '/out.mp4',
    })
    const graph = args[args.indexOf('-filter_complex') + 1]!
    expect(graph).toContain('[0:v]trim=start=90:end=200,setpts=PTS-STARTPTS[v1]')
    expect(graph).toContain('concat=n=2:v=1:a=1[vc][ac]')
    expect(graph).toContain('[1:v]scale=1920:1080,format=rgba[sb]')
    expect(graph).toContain('setpts=PTS-STARTPTS+29/TB[t0]')
    expect(graph).toContain('[w0]adelay=29000|29000[wd0]')
    expect(args.slice(-1)).toEqual(['/out.mp4'])
  })

  it('refuses an edit with nothing left', () => {
    expect(() => bodyArgs({ source: SRC, segments: [], crop: null, frame: { width: 1, height: 1, fps: '30/1' }, scoreList: null, transitions: [], whoosh: '', enc: { draft: true }, out: '' })).toThrow(/Nothing left/)
  })
})
