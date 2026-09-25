import { Resvg } from '@resvg/resvg-js'
import { parseCssColor, type SvgPaint } from './color'
import { isTileTone, type Gradient, type Icon, type IconStyle, type Role, type Shape, type ToneStyle } from './types'

export interface PaintOptions {
  readonly strokeWidth?: number
  readonly roles?: readonly Role[]
  readonly color?: string
  readonly size?: number
}

const XMLNS = 'http://www.w3.org/2000/svg'

export const fmt = (n: number): string => Number(n.toFixed(3)).toString()

const escapeXml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function shapeToSvg(shape: Shape): string {
  switch (shape.kind) {
    case 'path':
      return `<path d="${escapeXml(shape.d)}"/>`
    case 'circle':
      return `<circle cx="${fmt(shape.cx)}" cy="${fmt(shape.cy)}" r="${fmt(shape.r)}"/>`
    case 'rect': {
      const rx = shape.rx === 0 ? '' : ` rx="${fmt(shape.rx)}"`
      return `<rect x="${fmt(shape.x)}" y="${fmt(shape.y)}" width="${fmt(shape.width)}" height="${fmt(shape.height)}"${rx}/>`
    }
    case 'line':
      return `<line x1="${fmt(shape.x1)}" y1="${fmt(shape.y1)}" x2="${fmt(shape.x2)}" y2="${fmt(shape.y2)}"/>`
    case 'polyline':
      return `<polyline points="${shape.points.map(([x, y]) => `${fmt(x)},${fmt(y)}`).join(' ')}"/>`
  }
}

function paint(color: string): SvgPaint {
  const p = parseCssColor(color)
  if (p === null) throw new Error(`invalid colour "${color}"`)
  return p
}

const opacityAttr = (name: string, a: number): string => (a === 1 ? '' : ` ${name}="${fmt(a)}"`)

function fillAttrs(p: SvgPaint): string {
  return `fill="${p.rgb}"${opacityAttr('fill-opacity', p.opacity)} stroke="none"`
}

function strokeAttrs(p: SvgPaint, style: IconStyle, width: number): string {
  return `fill="none" stroke="${p.rgb}"${opacityAttr('stroke-opacity', p.opacity)} stroke-width="${fmt(width)}" stroke-linecap="${style.caps}" stroke-linejoin="${style.joins}"`
}

function roleColor(role: Role, tone: ToneStyle, toneName: string): string {
  switch (role) {
    case 'plane':
      return tone.plane
    case 'line':
    case 'dot':
      return tone.line
    case 'accent':
      if (tone.accent === undefined) throw new Error(`tone "${toneName}" has no accent colour`)
      return tone.accent
  }
}

interface GroupPaint {
  readonly strokeWidth: number
  readonly roles: readonly Role[] | undefined
  readonly colorOf: (role: Role) => SvgPaint
}

function groups(icon: Icon, style: IconStyle, gp: GroupPaint): string {
  let out = ''
  for (const layer of icon.layers) {
    if (gp.roles !== undefined && !gp.roles.includes(layer.role)) continue
    const p = gp.colorOf(layer.role)
    const attrs = layer.role === 'line' ? strokeAttrs(p, style, gp.strokeWidth) : fillAttrs(p)
    out += `<g ${attrs}>${layer.shapes.map(shapeToSvg).join('')}</g>`
  }
  return out
}

function toneOf(style: IconStyle, tone: string): ToneStyle {
  const t = style.tones[tone]
  if (t === undefined) throw new Error(`unknown tone "${tone}"`)
  return t
}

function toneGroups(icon: Icon, style: IconStyle, toneName: string, opts: PaintOptions = {}): string {
  const tone = toneOf(style, toneName)
  const override = opts.color === undefined ? null : { ...paint(opts.color), opacity: 1 }
  return groups(icon, style, {
    strokeWidth: opts.strokeWidth ?? style.stroke,
    roles: opts.roles,
    colorOf: (role) => override ?? paint(roleColor(role, tone, toneName)),
  })
}

const sizeAttrs = (size: number | undefined): string =>
  size === undefined ? '' : ` width="${fmt(size)}" height="${fmt(size)}"`

export function paintIcon(icon: Icon, style: IconStyle, tone: string, opts: PaintOptions = {}): string {
  const body = toneGroups(icon, style, tone, opts)
  return `<svg xmlns="${XMLNS}" viewBox="0 0 ${fmt(icon.grid)} ${fmt(icon.grid)}"${sizeAttrs(opts.size)}>${body}</svg>`
}

/** One flat opaque colour, no tone needed. Used for masks. */
export function paintSilhouette(
  icon: Icon,
  style: IconStyle,
  opts: { readonly roles?: readonly Role[]; readonly strokeWidth?: number; readonly color?: string } = {},
): string {
  const p = { ...paint(opts.color ?? '#000000'), opacity: 1 }
  const body = groups(icon, style, { strokeWidth: opts.strokeWidth ?? style.stroke, roles: opts.roles, colorOf: () => p })
  return `<svg xmlns="${XMLNS}" viewBox="0 0 ${fmt(icon.grid)} ${fmt(icon.grid)}">${body}</svg>`
}

// TODO(fable): swap for resolveGradientStops from style.ts
function gradientStops(g: Gradient): { color: string; offset: number }[] {
  const parsed = g.stops.map((raw) => {
    const m = /^(.*\S)\s+(-?\d*\.?\d+)%$/.exec(raw.trim())
    if (m?.[1] !== undefined && m[2] !== undefined) return { color: m[1], offset: Number(m[2]) / 100 }
    return { color: raw.trim(), offset: undefined }
  })
  const offsets: (number | undefined)[] = parsed.map((p) => p.offset)
  const n = offsets.length
  if (n === 0) return []
  if (offsets[0] === undefined) offsets[0] = 0
  if (n > 1 && offsets[n - 1] === undefined) offsets[n - 1] = 1
  let i = 0
  while (i < n) {
    if (offsets[i] !== undefined) {
      i++
      continue
    }
    const start = i - 1
    let end = i
    while (end < n && offsets[end] === undefined) end++
    const a = offsets[start] ?? 0
    const b = offsets[end] ?? 1
    for (let k = start + 1; k < end; k++) offsets[k] = a + ((b - a) * (k - start)) / (end - start)
    i = end
  }
  return parsed.map((p, k) => ({ color: p.color, offset: offsets[k] ?? 0 }))
}

function tileRadius(radius: string | undefined, size: number): number {
  if (radius === undefined) return size * 0.25
  const r = radius.trim()
  if (r.endsWith('%')) return (size * Number(r.slice(0, -1))) / 100
  const n = Number(r.endsWith('px') ? r.slice(0, -2) : r)
  if (!Number.isFinite(n)) throw new Error(`invalid tile radius "${radius}"`)
  return n
}

/** Tile content in a `0 0 S S` user space; `gradId` must be unique within the document. */
function tileBody(icon: Icon, style: IconStyle, toneName: string, size: number, gradId: string): string {
  const tone = toneOf(style, toneName)
  const bg = tone.bg
  if (bg === undefined) throw new Error(`tone "${toneName}" is not a tile tone`)
  let defs = ''
  let fill: string
  if (typeof bg === 'string') {
    const p = paint(bg)
    fill = `fill="${p.rgb}"${opacityAttr('fill-opacity', p.opacity)}`
  } else {
    const t = (bg.angle * Math.PI) / 180
    const dx = Math.sin(t)
    const dy = -Math.cos(t)
    const stops = gradientStops(bg)
      .map((s) => {
        const p = paint(s.color)
        return `<stop offset="${fmt(s.offset)}" stop-color="${p.rgb}" stop-opacity="${fmt(p.opacity)}"/>`
      })
      .join('')
    defs = `<defs><linearGradient id="${gradId}" x1="${fmt(0.5 - dx / 2)}" y1="${fmt(0.5 - dy / 2)}" x2="${fmt(0.5 + dx / 2)}" y2="${fmt(0.5 + dy / 2)}" gradientUnits="objectBoundingBox">${stops}</linearGradient></defs>`
    fill = `fill="url(#${gradId})"`
  }
  const r = tileRadius(tone.radius, size)
  const inner = Math.round(size * tone.scale)
  const off = (size - inner) / 2
  const glyph = `<svg x="${fmt(off)}" y="${fmt(off)}" width="${inner}" height="${inner}" viewBox="0 0 ${fmt(icon.grid)} ${fmt(icon.grid)}">${toneGroups(icon, style, toneName)}</svg>`
  return `${defs}<rect width="${fmt(size)}" height="${fmt(size)}" rx="${fmt(r)}" ${fill}/>${glyph}`
}

export function paintTile(icon: Icon, style: IconStyle, tone: string, sizePx: number): string {
  const s = fmt(sizePx)
  return `<svg xmlns="${XMLNS}" viewBox="0 0 ${s} ${s}" width="${s}" height="${s}">${tileBody(icon, style, tone, sizePx, 'bg')}</svg>`
}

export function renderPng(svg: string, widthPx: number): Uint8Array {
  const r = new Resvg(svg, { fitTo: { mode: 'width', value: widthPx }, font: { loadSystemFonts: true } })
  return new Uint8Array(r.render().asPng())
}

// ---- contact sheet -------------------------------------------------------------------------------

export interface SheetRow {
  readonly icon: Icon
  readonly label: string
}
export interface SheetSpec {
  readonly rows: readonly SheetRow[]
  readonly style: IconStyle
  readonly title?: string
}
export interface Sheet {
  readonly svg: string
  readonly png: Uint8Array
  readonly width: number
  readonly height: number
}

export type SheetCell =
  | { readonly kind: 'grid'; readonly tone: string; readonly size: 128 }
  | { readonly kind: 'tile'; readonly tone: string; readonly size: number }
  | { readonly kind: 'inline'; readonly tone: string; readonly sizes: readonly number[] }

export const SHEET = {
  pad: 24,
  bg: '#F3F5F8',
  titleHeight: 32,
  rowHeight: 144,
  rowGap: 16,
  colGap: 22,
  labelWidth: 150,
  grid: 128,
  gridStep: 16,
  tileSizes: [64, 44],
  inlineSizes: [24, 20, 16],
  pillHeight: 40,
  pillPad: 12,
  pillGap: 14,
  ink: '#1C1A1F',
  card: '#FFFFFF',
  border: '#E2E6ED',
  gridLine: '#E9ECF1',
} as const

export function sheetCells(style: IconStyle): SheetCell[] {
  const names = Object.keys(style.tones)
  const tileNames = names.filter((n) => {
    const t = style.tones[n]
    return t !== undefined && isTileTone(t)
  })
  const flatNames = names.filter((n) => !tileNames.includes(n))
  const gridTone = flatNames[0] ?? names[0]
  const cells: SheetCell[] = []
  if (gridTone !== undefined) cells.push({ kind: 'grid', tone: gridTone, size: SHEET.grid })
  for (const tone of tileNames) for (const size of SHEET.tileSizes) cells.push({ kind: 'tile', tone, size })
  for (const tone of flatNames) cells.push({ kind: 'inline', tone, sizes: [...SHEET.inlineSizes] })
  return cells
}

const pillWidth = (sizes: readonly number[]): number =>
  SHEET.pillPad * 2 + sizes.reduce((a, b) => a + b, 0) + SHEET.pillGap * Math.max(0, sizes.length - 1)

function cellWidth(c: SheetCell): number {
  switch (c.kind) {
    case 'grid':
    case 'tile':
      return c.size
    case 'inline':
      return pillWidth(c.sizes)
  }
}

const nest = (x: number, y: number, w: number, h: number, viewBox: string, body: string): string =>
  `<svg x="${fmt(x)}" y="${fmt(y)}" width="${fmt(w)}" height="${fmt(h)}" viewBox="${viewBox}">${body}</svg>`

function gridCell(icon: Icon, style: IconStyle, toneName: string): string {
  const tone = toneOf(style, toneName)
  const size = SHEET.grid
  let lines = ''
  for (let p = SHEET.gridStep; p < size; p += SHEET.gridStep) {
    lines += `<line x1="${p + 0.5}" y1="0" x2="${p + 0.5}" y2="${size}"/><line x1="0" y1="${p + 0.5}" x2="${size}" y2="${p + 0.5}"/>`
  }
  const on = paint(tone.on)
  const g = fmt(icon.grid)
  return (
    `<rect width="${size}" height="${size}" fill="${on.rgb}"${opacityAttr('fill-opacity', on.opacity)}/>` +
    `<g stroke="${SHEET.gridLine}" stroke-width="1">${lines}</g>` +
    `<rect x="0.5" y="0.5" width="${size - 1}" height="${size - 1}" fill="none" stroke="${SHEET.border}" stroke-width="1"/>` +
    nest(0, 0, size, size, `0 0 ${g} ${g}`, toneGroups(icon, style, toneName))
  )
}

function inlineCell(icon: Icon, style: IconStyle, toneName: string, sizes: readonly number[]): string {
  const tone = toneOf(style, toneName)
  const on = paint(tone.on)
  const w = pillWidth(sizes)
  const h = SHEET.pillHeight
  const g = fmt(icon.grid)
  let out = `<rect width="${w}" height="${h}" rx="8" fill="${on.rgb}"${opacityAttr('fill-opacity', on.opacity)}/>`
  let x = SHEET.pillPad
  for (const s of sizes) {
    out += nest(x, (h - s) / 2, s, s, `0 0 ${g} ${g}`, toneGroups(icon, style, toneName))
    x += s + SHEET.pillGap
  }
  return out
}

export function renderSheet(spec: SheetSpec): Sheet {
  const { style, rows } = spec
  const cells = sheetCells(style)
  const widths = [SHEET.labelWidth, ...cells.map(cellWidth)]
  // The card holds every column plus a colGap margin on both sides.
  const cardWidth = widths.reduce((a, b) => a + b, 0) + SHEET.colGap * (widths.length + 1)
  const width = SHEET.pad * 2 + cardWidth
  const top = SHEET.pad + (spec.title === undefined ? 0 : SHEET.titleHeight)
  const rowsHeight = rows.length * SHEET.rowHeight + Math.max(0, rows.length - 1) * SHEET.rowGap
  const height = top + rowsHeight + SHEET.pad

  const parts: string[] = [`<rect width="${width}" height="${height}" fill="${SHEET.bg}"/>`]
  if (spec.title !== undefined) {
    parts.push(
      `<text x="${SHEET.pad}" y="${SHEET.pad + 21}" font-family="system-ui, -apple-system, 'Segoe UI', Arial, sans-serif" font-size="16" font-weight="700" fill="${SHEET.ink}">${escapeXml(spec.title)}</text>`,
    )
  }
  let gradSeq = 0
  rows.forEach((row, i) => {
    const y = top + i * (SHEET.rowHeight + SHEET.rowGap)
    const mid = y + SHEET.rowHeight / 2
    parts.push(
      `<rect x="${SHEET.pad + 0.5}" y="${y + 0.5}" width="${cardWidth - 1}" height="${SHEET.rowHeight - 1}" rx="12" fill="${SHEET.card}" stroke="${SHEET.border}" stroke-width="1"/>`,
    )
    let x = SHEET.pad + SHEET.colGap
    parts.push(
      `<text x="${x}" y="${fmt(mid + 4.5)}" font-family="ui-monospace, 'Cascadia Mono', Consolas, monospace" font-size="13" font-weight="600" fill="${SHEET.ink}">${escapeXml(row.label)}</text>`,
    )
    x += SHEET.labelWidth + SHEET.colGap
    for (const cell of cells) {
      const w = cellWidth(cell)
      switch (cell.kind) {
        case 'grid':
          parts.push(nest(x, mid - w / 2, w, w, `0 0 ${w} ${w}`, gridCell(row.icon, style, cell.tone)))
          break
        case 'tile': {
          const body = tileBody(row.icon, style, cell.tone, cell.size, `bg${gradSeq++}`)
          parts.push(nest(x, mid - w / 2, w, w, `0 0 ${w} ${w}`, body))
          break
        }
        case 'inline': {
          const h = SHEET.pillHeight
          parts.push(nest(x, mid - h / 2, w, h, `0 0 ${w} ${h}`, inlineCell(row.icon, style, cell.tone, cell.sizes)))
          break
        }
      }
      x += w + SHEET.colGap
    }
  })
  const svg = `<svg xmlns="${XMLNS}" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${parts.join('')}</svg>`
  return { svg, png: renderPng(svg, width), width, height }
}
