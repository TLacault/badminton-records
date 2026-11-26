/**
 * Draws a YouTube thumbnail: Tim's family template + the two bottom bands
 * (+ HIGHLIGHTS under the tag, for a clip).
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

/** Loads Poppins Bold Italic (bands) and Barlow Condensed Black Italic (HIGHLIGHTS) once, from the brand kit. */
let fontReady: Promise<void> | null = null
export function loadThumbnailFont(url: string): Promise<void> {
  fontReady ??= Promise.all([
    new FontFace('Poppins Thumb', `url(${url})`, { style: 'italic', weight: '700' }).load(),
    new FontFace('Barlow Thumb', `url(${url.replace('Poppins-BoldItalic', 'BarlowCondensed-BlackItalic')})`, { style: 'italic', weight: '900' }).load(),
  ]).then((faces) => { faces.forEach(face => document.fonts.add(face)) })
  return fontReady
}

/** HIGHLIGHTS under the template's top-left tag (which ends ~y 284), clear of the logo (x ≥ ~1140). */
export const HIGHLIGHT = { left: 150, top: 330, size: 200, maxRight: 1080 }

/**
 * The clip's word under the tag, with the video intro's flare behind it: a
 * light streak across the word, a hot core near its end and a soft glow.
 */
function drawHighlights(ctx: CanvasRenderingContext2D, text: string, colour: string) {
  let size = HIGHLIGHT.size
  const font = (px: number) => `italic 900 ${px}px "Barlow Thumb"`
  ctx.font = font(size)
  ctx.letterSpacing = `${Math.round(size * 0.04)}px`
  while (ctx.measureText(text).width > HIGHLIGHT.maxRight - HIGHLIGHT.left && size > 80) {
    size -= 4
    ctx.font = font(size)
    ctx.letterSpacing = `${Math.round(size * 0.04)}px`
  }
  const width = ctx.measureText(text).width
  const capTop = HIGHLIGHT.top
  const baseline = capTop + size * 0.72
  const mid = capTop + size * 0.36

  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  // Soft glow behind the word.
  const glow = ctx.createRadialGradient(HIGHLIGHT.left + width / 2, mid, 0, HIGHLIGHT.left + width / 2, mid, width * 0.7)
  glow.addColorStop(0, `${colour}66`)
  glow.addColorStop(1, `${colour}00`)
  ctx.fillStyle = glow
  ctx.fillRect(0, mid - width * 0.7, HIGHLIGHT.left + width * 1.5, width * 1.4)
  // The streak.
  const streak = ctx.createLinearGradient(0, 0, HIGHLIGHT.left + width + 60, 0)
  streak.addColorStop(0, 'rgba(255,255,255,0)')
  streak.addColorStop(0.55, 'rgba(255,255,255,1)')
  streak.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.shadowColor = colour
  ctx.shadowBlur = 60
  ctx.fillStyle = streak
  ctx.fillRect(0, mid - 8, HIGHLIGHT.left + width + 60, 16)
  // A thinner streak above and below, so the flare shows past the letters.
  ctx.globalAlpha = 0.5
  ctx.fillRect(0, capTop - 18, HIGHLIGHT.left + width + 60, 4)
  ctx.fillRect(0, baseline + 14, HIGHLIGHT.left + width + 60, 4)
  ctx.globalAlpha = 1
  // The hot core, three quarters along.
  const cx = HIGHLIGHT.left + width * 0.72
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
  ctx.font = font(size)
  ctx.letterSpacing = `${Math.round(size * 0.04)}px`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.shadowColor = colour
  ctx.shadowBlur = 36
  ctx.fillStyle = '#ffffff'
  ctx.fillText(text, HIGHLIGHT.left, baseline)
  ctx.restore()
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
