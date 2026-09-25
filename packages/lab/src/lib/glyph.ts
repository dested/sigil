import type { IconStyle, ToneStyle } from '@sigil/core'

export interface GlyphMarkupOptions {
  readonly tone: string
  readonly size: number
  readonly title?: string
}

/** Rendering only needs the tones; accepting the subset keeps serialized router output assignable. */
export type ToneSource = Pick<IconStyle, 'tones'>

const DROP_ATTRS = new Set(['data-sigil', 'data-brief', 'width', 'height', 'class'])
const ATTR_RE = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
const ROLE_RE = /data-role\s*=\s*(?:"([^"]*)"|'([^']*)')/g

const escapeText = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const escapeAttr = (s: string): string => escapeText(s).replace(/"/g, '&quot;')

export function glyphMarkup(svgSource: string, opts: GlyphMarkupOptions): string {
  const body = svgSource
    .replace(/<\?xml[\s\S]*?\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim()
  const root = /<svg\b([^>]*)>/.exec(body)
  if (root === null) throw new Error('not a sigil svg')
  const rawAttrs = root[1] ?? ''
  const kept: string[] = []
  for (const m of rawAttrs.matchAll(ATTR_RE)) {
    const name = m[1] ?? ''
    if (name === '' || DROP_ATTRS.has(name)) continue
    kept.push(`${name}="${escapeAttr(m[2] ?? m[3] ?? '')}"`)
  }
  const size = String(opts.size)
  kept.push(`class="sg-svg sg-tone-${escapeAttr(opts.tone)}"`, `width="${size}"`, `height="${size}"`)
  kept.push(opts.title === undefined ? 'aria-hidden="true"' : `role="img" aria-label="${escapeAttr(opts.title)}"`)
  const titleEl = opts.title === undefined ? '' : `<title>${escapeText(opts.title)}</title>`
  const selfClosing = rawAttrs.trimEnd().endsWith('/')
  const open = `<svg ${kept.join(' ')}>${titleEl}${selfClosing ? '</svg>' : ''}`
  const rest = body.slice(root.index + root[0].length)
  return (open + rest).replace(ROLE_RE, (_m: string, dq: string | undefined, sq: string | undefined) => {
    return `class="sg-${escapeAttr(dq ?? sq ?? '')}"`
  })
}

export function tileMarkup(
  svgSource: string,
  opts: { readonly tone: string; readonly size: number; readonly scale: number },
): string {
  const inner = glyphMarkup(svgSource, { tone: opts.tone, size: Math.round(opts.size * opts.scale) })
  return `<span class="sg-tile-${escapeAttr(opts.tone)}" style="width:${opts.size}px;height:${opts.size}px">${inner}</span>`
}

export function isTile(tone: ToneStyle): boolean {
  return tone.bg !== undefined
}

function isTileName(style: ToneSource, name: string): boolean {
  const tone = style.tones[name]
  return tone !== undefined && isTile(tone)
}

export function firstInlineTone(style: ToneSource): string {
  const names = Object.keys(style.tones)
  return names.find((n) => !isTileName(style, n)) ?? names[0] ?? ''
}

export function firstTileTone(style: ToneSource): string | null {
  return Object.keys(style.tones).find((n) => isTileName(style, n)) ?? null
}

export function darkTone(style: ToneSource): string | null {
  for (const [name, tone] of Object.entries(style.tones)) {
    if (isTile(tone)) continue
    const lum = luminance(tone.on)
    if (lum !== null && lum < 0.4) return name
  }
  return null
}

/** CSS background for a tile's `bg` (a colour or a gradient). */
export function tileBackground(bg: NonNullable<ToneStyle['bg']>): string {
  return typeof bg === 'string' ? bg : `linear-gradient(${bg.angle}deg, ${bg.stops.join(', ')})`
}

/** WCAG relative luminance of `#rgb`, `#rrggbb(aa)` or `rgb()/rgba()`; null for anything else. */
export function luminance(colour: string): number | null {
  const rgb = parseRgb(colour.trim())
  if (rgb === null) return null
  const lin = (c: number): number => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2])
}

function parseRgb(c: string): readonly [number, number, number] | null {
  const hex = /^#([0-9a-f]{3,8})$/i.exec(c)?.[1]
  if (hex !== undefined) {
    if (hex.length === 3 || hex.length === 4) {
      const d = (i: number): number => parseInt(hex.charAt(i).repeat(2), 16)
      return [d(0), d(1), d(2)]
    }
    if (hex.length === 6 || hex.length === 8) {
      const d = (i: number): number => parseInt(hex.slice(i, i + 2), 16)
      return [d(0), d(2), d(4)]
    }
    return null
  }
  const fn = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(c)
  if (fn === null) return null
  return [Number(fn[1]), Number(fn[2]), Number(fn[3])]
}
