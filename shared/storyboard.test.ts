import { describe, expect, it } from 'vitest'
import { parseStoryboardSpec, storyboardFrame } from './storyboard'

// Shape of a real spec (dQw4w9WgXcQ), signatures shortened.
const SPEC = 'https://i.ytimg.com/sb/ID/storyboard3_L$L/$N.jpg?sqp=abc'
  + '|48#27#100#10#10#0#default#rs$A'
  + '|80#45#108#10#10#2000#M$M#rs$B'
  + '|160#90#108#5#5#2000#M$M#rs$C'
  + '|320#180#108#3#3#2000#M$M#rs$D'

describe('storyboard', () => {
  const sb = parseStoryboardSpec(SPEC)!

  it('picks the smallest level wide enough for the card', () => {
    expect(sb.width).toBe(160)
    expect(sb.sheets).toHaveLength(5)
    expect(sb.sheets[3]).toBe('https://i.ytimg.com/sb/ID/storyboard3_L2/M3.jpg?sqp=abc&sigh=rs%24C')
  })

  it('lands on the right tile, and counts the cropped last sheet', () => {
    // 27s → frame 13 → sheet 0, col 3, row 2 of a 5×5 grid.
    expect(storyboardFrame(sb, 27, 216)).toMatchObject({
      backgroundSize: '500% 500%',
      backgroundPosition: '75% 50%',
    })
    // Frame 107 is the 8th on the last sheet, which holds 2 rows.
    const last = storyboardFrame(sb, 999, 216)
    expect(last.backgroundImage).toContain('M4.jpg')
    expect(last).toMatchObject({ backgroundSize: '500% 200%', backgroundPosition: '50% 100%' })
  })

  it('refuses a spec with no levels', () => {
    expect(parseStoryboardSpec('https://x')).toBeNull()
  })
})
