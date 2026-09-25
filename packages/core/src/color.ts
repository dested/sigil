// CSS colour → SVG paint. resvg-safe: we always emit an opaque rgb() plus a separate
// opacity so `rgba(255,255,255,.26)` in icon.md never depends on renderer support.
// Fable-owned: agents read, never edit.

export interface SvgPaint {
  /** `rgb(r, g, b)` */
  readonly rgb: string
  /** 0..1 */
  readonly opacity: number
}

const HEX = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i
const FN = /^rgba?\(\s*([^)]*)\)$/i

const clamp255 = (n: number): number => Math.max(0, Math.min(255, Math.round(n)))
const clamp01 = (n: number): number => Math.max(0, Math.min(1, n))

function channel(token: string): number | null {
  const t = token.trim()
  if (t.endsWith('%')) {
    const p = Number(t.slice(0, -1))
    return Number.isFinite(p) ? clamp255((p / 100) * 255) : null
  }
  const n = Number(t)
  return Number.isFinite(n) ? clamp255(n) : null
}

function alpha(token: string): number | null {
  const t = token.trim()
  if (t.endsWith('%')) {
    const p = Number(t.slice(0, -1))
    return Number.isFinite(p) ? clamp01(p / 100) : null
  }
  const n = Number(t)
  return Number.isFinite(n) ? clamp01(n) : null
}

/** Accepts #rgb, #rgba, #rrggbb, #rrggbbaa, rgb(), rgba() (comma or space syntax, `/` alpha). Returns null otherwise. */
export function parseCssColor(input: string): SvgPaint | null {
  const s = input.trim()
  const hex = HEX.exec(s)
  if (hex?.[1] !== undefined) {
    const h = hex[1]
    const expand = h.length <= 4 ? [...h].map((c) => c + c).join('') : h
    const r = parseInt(expand.slice(0, 2), 16)
    const g = parseInt(expand.slice(2, 4), 16)
    const b = parseInt(expand.slice(4, 6), 16)
    const a = expand.length === 8 ? parseInt(expand.slice(6, 8), 16) / 255 : 1
    return { rgb: `rgb(${r}, ${g}, ${b})`, opacity: a }
  }
  const fn = FN.exec(s)
  if (fn?.[1] !== undefined) {
    const inner = fn[1].replace('/', ' ')
    const parts = inner.split(/[\s,]+/).filter((p) => p.length > 0)
    if (parts.length !== 3 && parts.length !== 4) return null
    const [rs, gs, bs, as] = parts
    if (rs === undefined || gs === undefined || bs === undefined) return null
    const r = channel(rs)
    const g = channel(gs)
    const b = channel(bs)
    const a = as === undefined ? 1 : alpha(as)
    if (r === null || g === null || b === null || a === null) return null
    return { rgb: `rgb(${r}, ${g}, ${b})`, opacity: a }
  }
  return null
}

export const isCssColor = (input: string): boolean => parseCssColor(input) !== null
