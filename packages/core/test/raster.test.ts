import { expect, test } from 'bun:test'
import {
  countComponents,
  fillRatio,
  innerBBoxUnits,
  maskBBox,
  maskCoverage,
  maskIou,
  normalizedIou,
  normalizeMask,
  rasterizeMask,
  type Mask,
} from '../src/raster'
import { box, FROZONE_STYLE, overflow } from './fixtures/glyphs'

const S = FROZONE_STYLE

const fromRows = (rows: readonly string[]): Mask => ({
  width: rows[0]?.length ?? 0,
  height: rows.length,
  data: new Uint8Array(rows.join('').split('').map(Number)),
})

test('box mask at 32px', () => {
  const m = rasterizeMask(box, S, 32)
  expect(m.width).toBe(32)
  expect(m.height).toBe(32)
  const c = maskCoverage(m)
  expect(c).toBeGreaterThan(0.3)
  expect(c).toBeLessThan(0.8)
  expect(countComponents(m)).toBe(1)
  expect(maskBBox(m)).toEqual({ x0: 4, y0: 4, x1: 27, y1: 27 })
  expect(fillRatio(m)).toBeGreaterThan(0.9)
})

test('iou', () => {
  const m = rasterizeMask(box, S, 32)
  expect(maskIou(m, m)).toBe(1)
  expect(maskIou(m, rasterizeMask(overflow, S, 32))).toBeLessThan(0.5)
  const empty: Mask = { width: 2, height: 2, data: new Uint8Array(4) }
  expect(maskIou(empty, empty)).toBe(0)
  expect(() => maskIou(m, empty)).toThrow()
})

test('components, bbox and fill on hand-built masks', () => {
  const two = fromRows(['11011000', '11011000', '00000000', '00000000'])
  expect(countComponents(two)).toBe(2)
  expect(maskBBox(two)).toEqual({ x0: 0, y0: 0, x1: 4, y1: 1 })
  expect(fillRatio(two)).toBeCloseTo(8 / 10)
  // a diagonal-only touch is not 4-connected
  expect(countComponents(fromRows(['11011000', '11011000', '00000100', '00000000']))).toBe(3)
  const empty = fromRows(['000', '000', '000'])
  expect(maskBBox(empty)).toBeNull()
  expect(fillRatio(empty)).toBe(0)
  expect(countComponents(empty)).toBe(0)
})

test('roles and stroke width feed the mask', () => {
  const lineOnly = rasterizeMask(box, S, 64, { roles: ['line'] })
  expect(maskCoverage(lineOnly)).toBeLessThan(maskCoverage(rasterizeMask(box, S, 64)))
  const thick = rasterizeMask(box, S, 64, { roles: ['line'], strokeWidth: 4 })
  expect(maskCoverage(thick)).toBeGreaterThan(maskCoverage(lineOnly))
})

test('innerBBoxUnits includes the stroke half-width', () => {
  const bb = innerBBoxUnits(box, S)
  if (bb === null) throw new Error('empty')
  expect(Math.abs(bb.x0 - 4)).toBeLessThanOrEqual(0.3)
  expect(Math.abs(bb.y0 - 4)).toBeLessThanOrEqual(0.3)
  expect(Math.abs(bb.x1 - 28)).toBeLessThanOrEqual(0.3)
  expect(Math.abs(bb.y1 - 28)).toBeLessThanOrEqual(0.3)
})

test('normalizeMask removes position and scale', () => {
  const small = fromRows(['0000', '0110', '0110', '0000'])
  const big = fromRows(['111000', '111000', '111000', '000000', '000000', '000000'])
  expect(normalizeMask(small, 4).data.every((v) => v === 1)).toBe(true)
  expect(normalizedIou(small, big, 8)).toBe(1)
  const empty = normalizeMask(fromRows(['00', '00']), 5)
  expect(empty.width).toBe(5)
  expect(empty.data.length).toBe(25)
  expect(empty.data.every((v) => v === 0)).toBe(true)
})
