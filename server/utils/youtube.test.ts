import { describe, expect, it } from 'vitest'
import { bestThumbnail, videoKindOf } from './youtube'

describe('bestThumbnail', () => {
  it('skips the 2560 qhd size, whose URL 404s on the CDN', () => {
    expect(bestThumbnail({
      high: { url: 'hq.jpg', width: 480 },
      maxres: { url: 'maxres.jpg', width: 1280 },
      qhd: { url: 'qhd.jpg', width: 2560 },
    })).toBe('maxres.jpg')
  })
})

describe('videoKindOf', () => {
  it('reads the kind off the title', () => {
    expect(videoKindOf('Gradignan 2026 | DH Poule #4 | Highlights')).toBe('highlights')
    expect(videoKindOf('Gradignan 2026 | DH | EDIT')).toBe('edit')
    expect(videoKindOf('Tournois Senior de Gradignan 2026 | DH Finale')).toBe('match')
    expect(videoKindOf('Gradignan DH #3', 'unlisted')).toBe('raw')
    expect(videoKindOf('Edited by Tim')).toBe('match')
  })
})
