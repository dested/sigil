import { Resvg } from '@resvg/resvg-js'
import { paintSilhouette } from './render'
import type { Icon, IconStyle, Role } from './types'

export interface Mask {
  readonly width: number
  readonly height: number
  /** 0|1 per pixel, row-major */
  readonly data: Uint8Array
}

export interface BBox {
  readonly x0: number
  readonly y0: number
  readonly x1: number
  readonly y1: number
}

export interface MaskOptions {
  readonly roles?: readonly Role[]
  readonly strokeWidth?: number
  /** alpha 0–255, default 128 */
  readonly threshold?: number
}

export function rasterizeMask(icon: Icon, style: IconStyle, sizePx: number, opts: MaskOptions = {}): Mask {
  const svg = paintSilhouette(icon, style, {
    ...(opts.roles === undefined ? {} : { roles: opts.roles }),
    ...(opts.strokeWidth === undefined ? {} : { strokeWidth: opts.strokeWidth }),
  })
  // Masks never draw text, so skip the (slow) system font scan.
  const img = new Resvg(svg, { fitTo: { mode: 'width', value: sizePx }, font: { loadSystemFonts: false } }).render()
  const { width, height } = img
  const px = img.pixels
  const threshold = opts.threshold ?? 128
  const data = new Uint8Array(width * height)
  for (let i = 0; i < data.length; i++) data[i] = (px[i * 4 + 3] ?? 0) >= threshold ? 1 : 0
  return { width, height, data }
}

export function maskCoverage(m: Mask): number {
  if (m.data.length === 0) return 0
  let n = 0
  for (const v of m.data) n += v
  return n / m.data.length
}

export function maskBBox(m: Mask): BBox | null {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < m.height; y++) {
    for (let x = 0; x < m.width; x++) {
      if (m.data[y * m.width + x] !== 1) continue
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 }
}

export function countComponents(m: Mask): number {
  const { width: w, height: h, data } = m
  const seen = new Uint8Array(w * h)
  const stack = new Int32Array(w * h)
  let count = 0
  for (let start = 0; start < data.length; start++) {
    if (data[start] !== 1 || seen[start] === 1) continue
    count++
    let top = 0
    stack[top++] = start
    seen[start] = 1
    while (top > 0) {
      const i = stack[--top] ?? 0
      const x = i % w
      const push = (j: number): void => {
        if (data[j] === 1 && seen[j] !== 1) {
          seen[j] = 1
          stack[top++] = j
        }
      }
      if (x > 0) push(i - 1)
      if (x < w - 1) push(i + 1)
      if (i >= w) push(i - w)
      if (i + w < w * h) push(i + w)
    }
  }
  return count
}

export function maskIou(a: Mask, b: Mask): number {
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(`mask size mismatch: ${a.width}×${a.height} vs ${b.width}×${b.height}`)
  }
  let inter = 0
  let union = 0
  for (let i = 0; i < a.data.length; i++) {
    const p = a.data[i] === 1
    const q = b.data[i] === 1
    if (p && q) inter++
    if (p || q) union++
  }
  return union === 0 ? 0 : inter / union
}

export function fillRatio(m: Mask): number {
  const bb = maskBBox(m)
  if (bb === null) return 0
  let n = 0
  for (const v of m.data) n += v
  return n / ((bb.x1 - bb.x0 + 1) * (bb.y1 - bb.y0 + 1))
}

const BBOX_SCALE = 8

/** Ink bounds in grid units, from the union mask at 8× grid. */
export function innerBBoxUnits(icon: Icon, style: IconStyle): BBox | null {
  const bb = maskBBox(rasterizeMask(icon, style, icon.grid * BBOX_SCALE))
  if (bb === null) return null
  return {
    x0: bb.x0 / BBOX_SCALE,
    y0: bb.y0 / BBOX_SCALE,
    x1: (bb.x1 + 1) / BBOX_SCALE,
    y1: (bb.y1 + 1) / BBOX_SCALE,
  }
}

/** Crop to the ink bbox, then stretch to size×size by nearest neighbour. Removes position and scale. */
export function normalizeMask(m: Mask, size: number): Mask {
  const data = new Uint8Array(size * size)
  const bb = maskBBox(m)
  if (bb === null) return { width: size, height: size, data }
  const w = bb.x1 - bb.x0 + 1
  const h = bb.y1 - bb.y0 + 1
  for (let y = 0; y < size; y++) {
    const sy = bb.y0 + Math.min(h - 1, Math.floor(((y + 0.5) * h) / size))
    for (let x = 0; x < size; x++) {
      const sx = bb.x0 + Math.min(w - 1, Math.floor(((x + 0.5) * w) / size))
      data[y * size + x] = m.data[sy * m.width + sx] ?? 0
    }
  }
  return { width: size, height: size, data }
}

export function normalizedIou(a: Mask, b: Mask, size = 24): number {
  return maskIou(normalizeMask(a, size), normalizeMask(b, size))
}
