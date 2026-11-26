import { describe, expect, it } from 'vitest'
import { bestThumbnail } from './youtube'

describe('bestThumbnail', () => {
  it('skips the 2560 qhd size, whose URL 404s on the CDN', () => {
    expect(bestThumbnail({
      high: { url: 'hq.jpg', width: 480 },
      maxres: { url: 'maxres.jpg', width: 1280 },
      qhd: { url: 'qhd.jpg', width: 2560 },
    })).toBe('maxres.jpg')
  })
})
