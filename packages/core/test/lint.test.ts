import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { lintIcon, lintIconSource } from '../src/lint'
import { parseIconMd } from '../src/style'
import type { Icon, IconStyle, Layer } from '../src/types'

function loadStyle(): IconStyle {
  const r = parseIconMd(readFileSync(join(import.meta.dir, 'fixtures', 'icon.md'), 'utf8'))
  if (!r.ok) throw new Error(JSON.stringify(r.findings))
  return r.value
}
const style = loadStyle()

const outline: Layer = {
  role: 'line',
  shapes: [
    { kind: 'path', d: 'M6 6L26 6L26 26H6V6Z' },
    { kind: 'line', x1: 10, y1: 12, x2: 22, y2: 12 },
    { kind: 'line', x1: 10, y1: 16.5, x2: 22, y2: 16.5 },
  ],
}
const clean: Icon = {
  name: 'orders',
  brief: 'a clipboard',
  grid: 32,
  layers: [
    { role: 'plane', shapes: [{ kind: 'rect', x: 7, y: 7, width: 18, height: 18, rx: 2 }] },
    outline,
    { role: 'dot', shapes: [{ kind: 'circle', cx: 16, cy: 22, r: 1.15 }] },
  ],
}

test('a clean icon has no findings', () => {
  expect(lintIcon(clean, style)).toEqual([])
})

test('role not enabled in style.roles is a schema.role error', () => {
  const f = lintIcon({ ...clean, layers: [...clean.layers, { role: 'accent', shapes: [{ kind: 'circle', cx: 4, cy: 4, r: 1 }] }] }, style)
  expect(f).toEqual([
    { icon: 'orders', rule: 'schema.role', severity: 'error', message: 'role "accent" is not enabled in icon.md roles [plane, line, dot]' },
  ])
})

test('grid mismatch is a schema.viewbox error', () => {
  expect(lintIcon({ ...clean, grid: 24 }, style).map((f) => f.rule)).toEqual(['schema.viewbox'])
})

test('off-grid rect is a grid.half warning', () => {
  const f = lintIcon({ ...clean, layers: [{ role: 'plane', shapes: [{ kind: 'rect', x: 7.3, y: 7, width: 18, height: 18, rx: 2.3 }] }, ...clean.layers.slice(1)] }, style)
  expect(f).toEqual([{ icon: 'orders', rule: 'grid.half', severity: 'warn', message: 'rect coordinate 7.3 is off the half-grid' }])
})

test('path grid check covers absolute M/L/H/V only', () => {
  const layers: Layer[] = [
    { role: 'plane', shapes: [{ kind: 'path', d: 'M6 6C6.3 7.7 8.1 9 10 10l.3.3A2.2 2.2 0 0 1 12 12' }] },
    ...clean.layers.slice(1),
  ]
  expect(lintIcon({ ...clean, layers }, style)).toEqual([])
  const bad: Layer[] = [{ role: 'plane', shapes: [{ kind: 'path', d: 'M6 6H26.2V26Z' }] }, ...clean.layers.slice(1)]
  expect(lintIcon({ ...clean, layers: bad }, style).map((f) => f.message)).toEqual(['path coordinate 26.2 is off the half-grid'])
})

test('0 inner marks is a budget.marks warning', () => {
  const f = lintIcon({ ...clean, layers: [{ role: 'line', shapes: [{ kind: 'circle', cx: 16, cy: 16, r: 8 }] }] }, style)
  expect(f).toEqual([{ icon: 'orders', rule: 'budget.marks', severity: 'warn', message: '0 inner marks, budget is 2–5' }])
})

test('lintIconSource returns parse findings and a null icon on parse failure', () => {
  const bad = lintIconSource('<svg viewBox="0 0 32 32"><g data-role="line"><text/></g></svg>', 'orders', style)
  expect(bad.icon).toBeNull()
  expect(bad.findings.map((f) => f.rule)).toContain('schema.element')
  const ok = lintIconSource(
    '<svg viewBox="0 0 32 32"><g data-role="line"><circle cx="16" cy="16" r="8"/><circle cx="16" cy="16" r="2"/><circle cx="16" cy="12" r="1"/></g></svg>',
    'orders',
    style,
  )
  expect(ok.icon?.name).toBe('orders')
  expect(ok.findings).toEqual([])
})
