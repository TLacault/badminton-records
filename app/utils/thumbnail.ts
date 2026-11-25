/**
 * Draws a YouTube thumbnail: Tim's family template + the two bottom bands.
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
 * Lines are drawn bottom-up into the bands as Tim's examples do: with two
 * lines they fill band 1 and band 2; a single line sits in band 2.
 */
export function drawThumbnail(
  ctx: CanvasRenderingContext2D,
  template: CanvasImageSource,
  lines: readonly string[],
  colour: string,
) {
  ctx.save()
  ctx.clearRect(0, 0, THUMB_W, THUMB_H)
  ctx.drawImage(template, 0, 0, THUMB_W, THUMB_H)

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
