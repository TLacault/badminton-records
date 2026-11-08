/**
 * YouTube storyboards: the sprite sheets its own scrub bar previews from.
 *
 * The watch page carries a spec string, `base|level|level…`, where each level
 * is `width#height#count#cols#rows#intervalMs#name#sigh`. `base` holds `$L`
 * (level index) and `$N` (sheet name, whose `$M` is the sheet number).
 */
export interface Storyboard {
  /** One URL per sprite sheet, in order. */
  sheets: string[]
  width: number
  height: number
  /** Frames in the whole video. */
  count: number
  cols: number
  rows: number
  /** Time between frames. 0 means the frames are spread evenly over the video. */
  intervalMs: number
}

/** The smallest level at least this wide: the preview card is 148px. */
const TARGET_WIDTH = 148

export function parseStoryboardSpec(spec: string): Storyboard | null {
  const [base, ...raw] = spec.split('|')
  if (!base || !raw.length) return null
  const levels = raw.map((part) => {
    const [w, h, count, cols, rows, interval, name, sigh] = part.split('#')
    return {
      width: Number(w),
      height: Number(h),
      count: Number(count),
      cols: Number(cols),
      rows: Number(rows),
      intervalMs: Number(interval),
      name: name ?? '',
      sigh: sigh ?? '',
    }
  })
  const index = Math.max(0, levels.findIndex(l => l.width >= TARGET_WIDTH))
  const level = levels[index] ?? levels.at(-1)!
  const perSheet = level.cols * level.rows
  if (!level.count || !perSheet) return null

  const sheets = Array.from({ length: Math.ceil(level.count / perSheet) }, (_, n) =>
    `${base.replace('$L', String(index)).replace('$N', level.name.replace('$M', String(n)))}&sigh=${encodeURIComponent(level.sigh)}`,
  )
  const { width, height, count, cols, rows, intervalMs } = level
  return { sheets, width, height, count, cols, rows, intervalMs }
}

/**
 * The CSS that shows the frame at `seconds`: which sheet, scaled so one tile
 * fills the box, shifted onto the right tile.
 *
 * The last sheet is cropped to the rows it uses, so its height in tiles is
 * counted rather than assumed.
 */
export function storyboardFrame(sb: Storyboard, seconds: number, duration: number) {
  const raw = sb.intervalMs
    ? Math.floor((seconds * 1000) / sb.intervalMs)
    : Math.floor((seconds / (duration || 1)) * sb.count)
  const index = Math.min(sb.count - 1, Math.max(0, raw))
  const perSheet = sb.cols * sb.rows
  const sheet = Math.floor(index / perSheet)
  const cell = index % perSheet
  const col = cell % sb.cols
  const row = Math.floor(cell / sb.cols)
  const rowsHere = Math.min(sb.rows, Math.ceil((sb.count - sheet * perSheet) / sb.cols))
  const at = (i: number, n: number) => (n > 1 ? (i / (n - 1)) * 100 : 0)
  return {
    backgroundImage: `url("${sb.sheets[sheet]}")`,
    backgroundSize: `${sb.cols * 100}% ${rowsHere * 100}%`,
    backgroundPosition: `${at(col, sb.cols)}% ${at(row, rowsHere)}%`,
  }
}
