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
export const HIGHLIGHT = { right: 2408, baseline: 803, size: 168, maxWidth: 1150, centre: null as number | null, canvasW: THUMB_W }
type HighlightSpec = typeof HIGHLIGHT

/**
 * The clip's word, with the video intro's flare behind it: a soft glow, a
 * light streak through the word and thin lines above and below, a hot core.
 */
function drawHighlights(ctx: CanvasRenderingContext2D, text: string, colour: string, spec: HighlightSpec = HIGHLIGHT) {
  let size = spec.size
  const setFont = () => {
    ctx.font = `italic 700 ${size}px ${FONT}`
    ctx.letterSpacing = `${LETTER_SPACING}px`
  }
  setFont()
  while (ctx.measureText(text).width > spec.maxWidth && size > 80) {
    size -= 4
    setFont()
  }
  const width = ctx.measureText(text).width
  const right = spec.centre === null ? spec.right : spec.centre + width / 2
  const left = right - width
  const capTop = spec.baseline - size * 0.705
  const mid = (capTop + spec.baseline) / 2
  const from = left - 260
  const to = Math.min(spec.canvasW, right + 120)

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
  ctx.fillRect(from, spec.baseline + 18, to - from, 4)
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
  ctx.fillText(text, right, spec.baseline)
  ctx.restore()
}

/** One slanted band running off the right edge, its text right-aligned (font set by the caller). */
function drawBand(
  ctx: CanvasRenderingContext2D,
  text: string,
  band: { top: number, height: number },
  g: { size: number, textRight: number, pad: number, slant: number, canvasW: number },
  colour: string,
) {
  const width = ctx.measureText(text).width
  // Left edge at mid-height sits `pad` before the text.
  const midLeft = g.textRight - width - g.pad
  ctx.fillStyle = colour
  ctx.beginPath()
  ctx.moveTo(midLeft + g.slant / 2, band.top)
  ctx.lineTo(g.canvasW, band.top)
  ctx.lineTo(g.canvasW, band.top + band.height)
  ctx.lineTo(midLeft - g.slant / 2, band.top + band.height)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  // Cap height (0.705 em) centred in the band.
  ctx.fillText(text, g.textRight, band.top + band.height / 2 + (g.size * 0.705) / 2)
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
  lines.forEach((text, i) => drawBand(ctx, text, slots[i]!, { size: FONT_SIZE, textRight: TEXT_RIGHT, pad: TEXT_LEFT_PAD, slant: BAND_SLANT, canvasW: THUMB_W }, colour))
  ctx.restore()
}

/** Canvas → PNG blob at a given width (1280 for YouTube, 2560 for the master). */
export async function exportThumbnail(source: HTMLCanvasElement, width: number): Promise<Blob> {
  const out = document.createElement('canvas')
  out.width = width
  out.height = Math.round((width * source.height) / source.width)
  const ctx = out.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, out.width, out.height)
  return new Promise((resolve, reject) => out.toBlob(b => (b ? resolve(b) : reject(new Error('PNG export failed'))), 'image/png'))
}

// ── Vertical (Shorts / Reels cover) ─────────────────────────────────────────

export const VTHUMB_W = 1080
export const VTHUMB_H = 1920
/** Words stay inside the centre 3:4 (y 240–1680): what a Reels profile grid shows. */
const V = {
  tag: { top: 300, height: 96, size: 54, padLeft: 70, padRight: 70, slant: 40 },
  logo: { top: 420, size: 400 },
  word: { size: 150, first: 960, second: 1090 },
  highlight: { ...HIGHLIGHT, size: 132, baseline: 1270, maxWidth: 900, centre: VTHUMB_W / 2, canvasW: VTHUMB_W },
  bands: [{ top: 1370, height: 112 }, { top: 1510, height: 112 }],
  text: { size: 58, min: 34, right: VTHUMB_W - 70, pad: 70, slant: 86 },
}

let wordFontReady: Promise<void> | null = null
export function loadWordmarkFont(url: string): Promise<void> {
  wordFontReady ??= new FontFace('Barlow Thumb', `url(${url})`, { style: 'italic', weight: '900' })
    .load()
    .then((face) => { document.fonts.add(face) })
  return wordFontReady
}

/**
 * The 9:16 cover, composed from the portrait intro's pieces (no hand-made
 * template exists): its jumping player recoloured to the family, the tag, the
 * logo and wordmark, HIGHLIGHTS, and the same two bands, shrunk to fit.
 */
export function drawVerticalThumbnail(
  ctx: CanvasRenderingContext2D,
  background: CanvasImageSource,
  logo: CanvasImageSource,
  tag: string,
  lines: readonly string[],
  colour: string,
  highlights = '',
) {
  const W = VTHUMB_W
  const H = VTHUMB_H
  ctx.save()
  ctx.clearRect(0, 0, W, H)
  ctx.filter = 'grayscale(1) brightness(1.15)'
  ctx.drawImage(background, 0, 0, W, H)
  ctx.filter = 'none'
  ctx.globalCompositeOperation = 'color'
  ctx.fillStyle = colour
  ctx.fillRect(0, 0, W, H)
  ctx.globalCompositeOperation = 'source-over'
  const shade = ctx.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.45, H * 0.7)
  shade.addColorStop(0, 'rgba(8,7,10,0.45)')
  shade.addColorStop(1, 'rgba(8,7,10,0.85)')
  ctx.fillStyle = shade
  ctx.fillRect(0, 0, W, H)
  // The templates' inset frame.
  ctx.strokeStyle = colour
  ctx.lineWidth = 12
  ctx.strokeRect(34, 34, W - 68, H - 68)

  ctx.textBaseline = 'alphabetic'
  ctx.letterSpacing = `${LETTER_SPACING}px`

  // Family tag, top left, slanted on the right like the template's.
  ctx.font = `italic 700 ${V.tag.size}px ${FONT}`
  const tw = ctx.measureText(tag).width
  const tagRight = V.tag.padLeft + tw + V.tag.padRight
  ctx.fillStyle = colour
  ctx.beginPath()
  ctx.moveTo(0, V.tag.top)
  ctx.lineTo(tagRight + V.tag.slant, V.tag.top)
  ctx.lineTo(tagRight, V.tag.top + V.tag.height)
  ctx.lineTo(0, V.tag.top + V.tag.height)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'left'
  ctx.fillText(tag, V.tag.padLeft, V.tag.top + V.tag.height / 2 + (V.tag.size * 0.705) / 2)

  ctx.drawImage(logo, (W - V.logo.size) / 2, V.logo.top, V.logo.size, V.logo.size)

  ctx.textAlign = 'center'
  ctx.letterSpacing = '0px'
  ctx.font = `italic 900 ${V.word.size}px "Barlow Thumb"`
  ctx.fillStyle = '#ffffff'
  ctx.fillText('BADMINTON', W / 2, V.word.first)
  ctx.fillStyle = colour
  ctx.fillText('RECORDS', W / 2, V.word.second)
  ctx.restore()

  if (highlights) drawHighlights(ctx, highlights, colour, V.highlight)

  ctx.save()
  ctx.letterSpacing = `${LETTER_SPACING}px`
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'right'
  const slots = V.bands.slice(V.bands.length - lines.length)
  lines.forEach((text, i) => {
    let size = V.text.size
    const fit = () => { ctx.font = `italic 700 ${size}px ${FONT}` }
    fit()
    while (ctx.measureText(text).width > V.text.right - V.text.pad - V.text.slant - 40 && size > V.text.min) {
      size -= 2
      fit()
    }
    drawBand(ctx, text, slots[i]!, { size, textRight: V.text.right, pad: V.text.pad, slant: V.text.slant, canvasW: W }, colour)
  })
  ctx.restore()
}
