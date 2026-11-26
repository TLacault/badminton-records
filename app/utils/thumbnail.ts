/**
 * Draws a YouTube thumbnail: Tim's family template + the two bottom bands
 * (+ HIGHLIGHTS under the logo, for a clip).
 *
 * Every number is measured off his hand-made examples in
 * brand/thumbnail/example/ (2560×1440): the template already carries the
 * frame, the family tag and the logo, so this only adds what changes per video.
 */

export const THUMB_W = 2560
export const THUMB_H = 1440

/** Band 1 and band 2: top edge and height, in template pixels. */
export const BANDS = [{ top: 951, height: 140 }, { top: 1156, height: 140 }] as const
/** Horizontal run of the slanted left edge over a band's height. */
export const BAND_SLANT = 107
/** Text ends this far from the right edge; bands run off the edge. */
export const TEXT_RIGHT = 2388
/** Band edge (at mid-height) to the first letter. */
export const TEXT_LEFT_PAD = 110
export const FONT = '"Poppins Thumb"'
export const FONT_SIZE = 82
export const LETTER_SPACING = 2

/** Loads Poppins Bold Italic once, from the brand kit. */
let fontReady: Promise<void> | null = null
export function loadThumbnailFont(url: string): Promise<void> {
  fontReady ??= new FontFace('Poppins Thumb', `url(${url})`, { style: 'italic', weight: '700' })
    .load()
    .then((face) => { document.fonts.add(face) })
  return fontReady
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Could not load ${url}`))
    img.src = url
  })
}

/**
 * HIGHLIGHTS for a clip, as Tim placed it: under the logo, right-aligned with
 * the bands, in their Poppins. Measured off his mockup (1450 wide) × 1.766.
 */
export const HIGHLIGHT = { right: 2408, baseline: 803, size: 168, maxWidth: 1150 }

/**
 * The clip's word, with the video intro's flare behind it: a soft glow, a
 * light streak through the word and thin lines above and below, a hot core.
 */
function drawHighlights(ctx: CanvasRenderingContext2D, text: string, colour: string) {
  let size = HIGHLIGHT.size
  const setFont = () => {
    ctx.font = `italic 700 ${size}px ${FONT}`
    ctx.letterSpacing = `${LETTER_SPACING}px`
  }
  setFont()
  while (ctx.measureText(text).width > HIGHLIGHT.maxWidth && size > 80) {
    size -= 4
    setFont()
  }
  const width = ctx.measureText(text).width
  const left = HIGHLIGHT.right - width
  const capTop = HIGHLIGHT.baseline - size * 0.705
  const mid = (capTop + HIGHLIGHT.baseline) / 2
  const from = left - 260
  const to = Math.min(THUMB_W, HIGHLIGHT.right + 120)

  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  const glow = ctx.createRadialGradient(left + width / 2, mid, 0, left + width / 2, mid, width * 0.65)
  glow.addColorStop(0, `${colour}66`)
  glow.addColorStop(1, `${colour}00`)
  ctx.fillStyle = glow
  ctx.fillRect(left - width * 0.2, mid - width * 0.65, width * 1.4, width * 1.3)

  const streak = ctx.createLinearGradient(from, 0, to, 0)
  streak.addColorStop(0, 'rgba(255,255,255,0)')
  streak.addColorStop(0.35, 'rgba(255,255,255,1)')
  streak.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.shadowColor = colour
  ctx.shadowBlur = 60
  ctx.fillStyle = streak
  ctx.fillRect(from, mid - 8, to - from, 16)
  ctx.globalAlpha = 0.5
  ctx.fillRect(from, capTop - 22, to - from, 4)
  ctx.fillRect(from, HIGHLIGHT.baseline + 18, to - from, 4)
  ctx.globalAlpha = 1

  const cx = left + width * 0.3
  const core = ctx.createRadialGradient(cx, mid, 0, cx, mid, size * 1.6)
  core.addColorStop(0, 'rgba(255,255,255,1)')
  core.addColorStop(0.12, 'rgba(255,255,255,0.85)')
  core.addColorStop(0.35, `${colour}aa`)
  core.addColorStop(1, `${colour}00`)
  ctx.shadowBlur = 0
  ctx.fillStyle = core
  ctx.fillRect(cx - size * 1.6, mid - size * 1.6, size * 3.2, size * 3.2)
  ctx.restore()

  ctx.save()
  setFont()
  ctx.textAlign = 'right'
  ctx.textBaseline = 'alphabetic'
  ctx.shadowColor = colour
  ctx.shadowBlur = 36
  ctx.fillStyle = '#ffffff'
  ctx.fillText(text, HIGHLIGHT.right, HIGHLIGHT.baseline)
  ctx.restore()
}

/**
 * Lines are drawn bottom-up into the bands as Tim's examples do: with two
 * lines they fill band 1 and band 2; a single line sits in band 2.
 */
export function drawThumbnail(
  ctx: CanvasRenderingContext2D,
  template: CanvasImageSource,
  lines: readonly string[],
  colour: string,
  highlights = '',
) {
  ctx.save()
  ctx.clearRect(0, 0, THUMB_W, THUMB_H)
  ctx.drawImage(template, 0, 0, THUMB_W, THUMB_H)
  if (highlights) drawHighlights(ctx, highlights, colour)

  ctx.font = `italic 700 ${FONT_SIZE}px ${FONT}`
  ctx.letterSpacing = `${LETTER_SPACING}px`
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'right'

  const slots = BANDS.slice(BANDS.length - lines.length)
  lines.forEach((text, i) => {
    const band = slots[i]!
    const width = ctx.measureText(text).width
    // Left edge at mid-height sits TEXT_LEFT_PAD before the text.
    const midLeft = TEXT_RIGHT - width - TEXT_LEFT_PAD
    const topLeft = midLeft + BAND_SLANT / 2
    const bottomLeft = midLeft - BAND_SLANT / 2
    ctx.fillStyle = colour
    ctx.beginPath()
    ctx.moveTo(topLeft, band.top)
    ctx.lineTo(THUMB_W, band.top)
    ctx.lineTo(THUMB_W, band.top + band.height)
    ctx.lineTo(bottomLeft, band.top + band.height)
    ctx.closePath()
    ctx.fill()

    ctx.fillStyle = '#ffffff'
    // Cap height (0.705 em) centred in the band.
    const baseline = band.top + band.height / 2 + (FONT_SIZE * 0.705) / 2
    ctx.fillText(text, TEXT_RIGHT, baseline)
  })
  ctx.restore()
}

/** Canvas → PNG blob at a given width (1280 for YouTube, 2560 for the master). */
export async function exportThumbnail(source: HTMLCanvasElement, width: number): Promise<Blob> {
  const out = document.createElement('canvas')
  out.width = width
  out.height = Math.round((width * THUMB_H) / THUMB_W)
  const ctx = out.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, out.width, out.height)
  return new Promise((resolve, reject) => out.toBlob(b => (b ? resolve(b) : reject(new Error('PNG export failed'))), 'image/png'))
}
