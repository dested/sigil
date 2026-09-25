import { expect, test } from 'bun:test'
import { paintIcon, paintTile, renderPng, renderSheet, sheetCells, shapeToSvg } from '../src/render'
import type { IconStyle, ToneStyle } from '../src/types'
import { allShapes, boost, box, FROZONE_STYLE, households, today } from './fixtures/glyphs'

const S = FROZONE_STYLE

const u32 = (png: Uint8Array, at: number): number => {
  const b = (i: number): number => png[at + i] ?? 0
  return ((b(0) << 24) | (b(1) << 16) | (b(2) << 8) | b(3)) >>> 0
}
const pngWidth = (png: Uint8Array): number => u32(png, 16)
const pngHeight = (png: Uint8Array): number => u32(png, 20)

const withTone = (tone: ToneStyle): IconStyle => ({ ...S, tones: { t: tone } })

test('shapeToSvg covers every shape kind', () => {
  const out = allShapes.layers.flatMap((l) => l.shapes.map(shapeToSvg)).join('')
  expect(out).toContain('<path d="M6 6h20"/>')
  expect(out).toContain('<circle cx="16" cy="16" r="5"/>')
  expect(out).toContain('<rect x="8" y="8" width="16" height="16"/>')
  expect(out).toContain('<rect x="6" y="6" width="20" height="20" rx="2"/>')
  expect(out).toContain('<line x1="4" y1="16" x2="28" y2="16"/>')
  expect(out).toContain('<polyline points="4,28 16,4 28,28"/>')
  expect(shapeToSvg({ kind: 'circle', cx: 1.23456, cy: 2, r: 0.1 })).toBe('<circle cx="1.235" cy="2" r="0.1"/>')
})

test('paintIcon paints roles from the tone', () => {
  const svg = paintIcon(today, S, 'inline')
  expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">')).toBe(true)
  expect(svg).toContain('stroke-width="2"')
  expect(svg).toContain('stroke-linecap="round"')
  expect(svg).toContain('stroke-linejoin="round"')
  expect(svg).toContain('<g fill="rgb(237, 185, 200)" stroke="none">')
  expect(svg).toContain('stroke="rgb(138, 30, 61)"')
  expect(svg).not.toContain('fill-opacity')
  expect((svg.match(/<g /g) ?? []).length).toBe(4)
})

test('paintIcon emits separate opacity for rgba colours', () => {
  expect(paintIcon(today, S, 'tile')).toContain('fill="rgb(255, 255, 255)" fill-opacity="0.26"')
  const dark = paintIcon(boost, S, 'on-dark')
  expect(dark).toContain('stroke-opacity="0.88"')
  // dot fills with the line colour
  expect(dark).toContain('<g fill="rgb(255, 255, 255)" fill-opacity="0.88" stroke="none"><circle')
})

test('paintIcon options', () => {
  expect(() => paintIcon(today, S, 'nope')).toThrow('unknown tone "nope"')
  const black = paintIcon(boost, S, 'inline', { color: '#000000', size: 48 })
  expect(black).toContain('width="48" height="48"')
  expect(black).not.toMatch(/rgb\((?!0, 0, 0\))/)
  expect(black).not.toContain('opacity')
  expect(black).toContain('stroke="rgb(0, 0, 0)"')
  const lines = paintIcon(boost, S, 'inline', { roles: ['line'], strokeWidth: 2.5 })
  expect(lines).not.toContain('stroke="none"')
  expect(lines).toContain('stroke-width="2.5"')
})

test('paintIcon accent requires a tone accent', () => {
  const accented = { ...today, layers: [{ role: 'accent' as const, shapes: [{ kind: 'circle' as const, cx: 16, cy: 16, r: 2 }] }] }
  expect(() => paintIcon(accented, S, 'inline')).toThrow()
  const inline = S.tones['inline']
  if (inline === undefined) throw new Error('fixture')
  expect(paintIcon(accented, withTone({ ...inline, accent: '#00ff00' }), 't')).toContain('fill="rgb(0, 255, 0)"')
})

test('paintTile draws the gradient box and a scaled glyph', () => {
  const svg = paintTile(households, S, 'tile', 44)
  expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 44 44" width="44" height="44">')).toBe(true)
  expect(svg).toContain('<linearGradient id="bg"')
  expect(svg).toContain('gradientUnits="objectBoundingBox"')
  const offsets = [...svg.matchAll(/<stop offset="([^"]+)"/g)].map((m) => m[1])
  expect(offsets).toEqual(['0', '0.55', '1'])
  expect(svg).toContain('stop-color="rgb(161, 42, 76)" stop-opacity="1"')
  expect(svg).toContain('fill="url(#bg)"')
  expect(svg).toContain('rx="11.88"')
  expect(svg).toContain('<svg x="9" y="9" width="26" height="26" viewBox="0 0 32 32">')
  expect(() => paintTile(households, S, 'inline', 44)).toThrow('tone "inline" is not a tile tone')
})

test('paintTile gradient direction and stop spreading', () => {
  const coords = (angle: number, stops: readonly string[]): { dir: string; offsets: string[] } => {
    const svg = paintTile(box, withTone({ line: '#fff', plane: '#fff', on: '#fff', scale: 0.6, bg: { angle, stops } }), 't', 32)
    const m = /x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)"/.exec(svg)
    return {
      dir: m === null ? '' : m.slice(1).join(' '),
      offsets: [...svg.matchAll(/<stop offset="([^"]+)"/g)].map((x) => x[1] ?? ''),
    }
  }
  expect(coords(0, ['#000', '#fff']).dir).toBe('0.5 1 0.5 0')
  expect(coords(90, ['#000', '#fff']).dir).toBe('0 0.5 1 0.5')
  expect(coords(180, ['#000', '#fff']).dir).toBe('0.5 0 0.5 1')
  expect(coords(0, ['#000', '#111', '#222', '#fff']).offsets).toEqual(['0', '0.333', '0.667', '1'])
  expect(coords(0, ['#000', '#111', 'rgba(0, 0, 0, .5) 60%', '#fff']).offsets).toEqual(['0', '0.3', '0.6', '1'])
})

test('paintTile radius units and solid bg', () => {
  const tone = (radius?: string): ToneStyle => ({
    line: '#fff',
    plane: '#fff',
    on: '#fff',
    scale: 0.5,
    bg: 'rgba(0,0,0,.5)',
    ...(radius === undefined ? {} : { radius }),
  })
  const rx = (radius?: string): string => /rx="([^"]+)"/.exec(paintTile(box, withTone(tone(radius)), 't', 40))?.[1] ?? ''
  expect(rx('6px')).toBe('6')
  expect(rx('7')).toBe('7')
  expect(rx()).toBe('10')
  const svg = paintTile(box, withTone(tone()), 't', 40)
  expect(svg).toContain('fill="rgb(0, 0, 0)" fill-opacity="0.5"')
  expect(svg).not.toContain('linearGradient')
})

test('renderPng produces a PNG of the requested width', () => {
  const png = renderPng(paintIcon(households, S, 'inline'), 64)
  expect([...png.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47])
  expect(pngWidth(png)).toBe(64)
})

test('sheetCells plans the columns from the tones', () => {
  expect(sheetCells(S)).toEqual([
    { kind: 'grid', tone: 'inline', size: 128 },
    { kind: 'tile', tone: 'tile', size: 64 },
    { kind: 'tile', tone: 'tile', size: 44 },
    { kind: 'inline', tone: 'inline', sizes: [24, 20, 16] },
    { kind: 'inline', tone: 'on-dark', sizes: [24, 20, 16] },
  ])
  const tileTone = S.tones['tile']
  if (tileTone === undefined) throw new Error('fixture')
  expect(sheetCells({ ...S, tones: { only: tileTone } })).toEqual([
    { kind: 'grid', tone: 'only', size: 128 },
    { kind: 'tile', tone: 'only', size: 64 },
    { kind: 'tile', tone: 'only', size: 44 },
  ])
})

test('renderSheet composes rows at true pixel size', () => {
  const sheet = renderSheet({
    style: S,
    rows: [
      { icon: today, label: 'today' },
      { icon: households, label: 'households <&>' },
      { icon: boost, label: 'boost' },
    ],
  })
  expect(sheet.height).toBe(24 * 2 + 3 * 144 + 2 * 16)
  expect(sheet.width).toBeGreaterThan(600)
  expect(sheet.svg).toContain('households &lt;&amp;&gt;')
  expect(sheet.svg).toContain('id="bg0"')
  expect(sheet.svg).toContain('id="bg5"')
  expect(pngWidth(sheet.png)).toBe(sheet.width)
  expect(pngHeight(sheet.png)).toBe(sheet.height)

  const titled = renderSheet({ style: S, rows: [{ icon: box, label: 'box' }], title: 'Round 1' })
  expect(titled.height).toBe(24 * 2 + 32 + 144)
  expect(titled.svg).toContain('>Round 1</text>')
})
