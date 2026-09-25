import { expect, test } from 'bun:test'
import { checkFamily, checkIcon } from '../src/checks'
import { maskIou, rasterizeMask } from '../src/raster'
import type { Finding, Icon, Shape } from '../src/types'
import {
  bigCircle,
  boost,
  box,
  discounts,
  FROZONE_STYLE,
  households,
  householdsTwin,
  mush,
  overflow,
  smallSquare,
  tinyDots,
  today,
} from './fixtures/glyphs'

const S = FROZONE_STYLE
const rules = (fs: readonly Finding[]): string[] => fs.map((f) => f.rule)
const find = (fs: readonly Finding[], rule: string): Finding | undefined => fs.find((f) => f.rule === rule)

test('keyline', () => {
  const f = find(checkIcon(overflow, S), 'keyline')
  expect(f?.severity).toBe('warn')
  expect(f?.message).toBe('ink spans 0.0–32.0 × 0.0–32.0, keyline is 3–29')
  expect(rules(checkIcon(box, S))).not.toContain('keyline')
})

test('mush merges and is too inky', () => {
  const fs = checkIcon(mush, S)
  const gap = find(fs, 'legibility.gap')
  expect(gap?.severity).toBe('warn')
  expect(gap?.message).toMatch(/^strokes closer than 2\.5 units merge \(\d+ → \d+ components\)$/)
  const ink = find(fs, 'legibility.ink')
  expect(ink?.severity).toBe('error')
  expect(ink?.message).toMatch(/^\d+% ink at 16px, max 35%$/)
})

test('tiny dots vanish at 16px', () => {
  const f = find(checkIcon(tinyDots, S), 'legibility.island')
  expect(f?.severity).toBe('warn')
  expect(f?.message).toBe('detail merges or vanishes at 16px (3 → 1 components)')
})

test('box has no legibility findings', () => {
  expect(rules(checkIcon(box, S)).filter((r) => r.startsWith('legibility.'))).toEqual([])
})

test('optical flags an undersized square', () => {
  const f = find(checkIcon(smallSquare, S), 'optical')
  expect(f?.severity).toBe('warn')
  expect(f?.message).toBe('square reads 14.0 units, target 22 (±3)')
})

test('optical flags an undersized circle', () => {
  const f = find(checkIcon(bigCircle, S), 'optical')
  expect(f?.severity).toBe('warn')
  expect(f?.message).toMatch(/^circle reads 1[78]\.\d units, target 24 \(±3\)$/)
})

test('optical is quiet on an on-target square', () => {
  expect(rules(checkIcon(box, S))).not.toContain('optical')
})

const collisions = (icons: readonly Icon[], neighbours: readonly Icon[] = []): Finding[] => {
  const groups = Object.fromEntries([...icons, ...neighbours].map((i) => [i.name, 'nav']))
  return checkFamily(icons, S, { groups, neighbours }).filter((f) => f.rule === 'collision')
}
const pairOf = (fs: readonly Finding[], a: string, b: string): Finding | undefined =>
  fs.find((f) => (f.icon === a && f.related?.[0] === b) || (f.icon === b && f.related?.[0] === a))

test('collision: the three houses are flagged by body IoU', () => {
  const fs = collisions([today, households, boost, discounts, box])
  for (const [a, b] of [
    ['households', 'today'],
    ['boost', 'today'],
    ['boost', 'households'],
  ] as const) {
    const f = pairOf(fs, a, b)
    expect(f?.icon).toBe(a)
    expect(f?.related).toEqual([b])
    expect(f?.severity).toBe('warn')
    expect(f?.message).toMatch(new RegExp(`^silhouette matches "${b}" \\(body IoU 0\\.\\d\\d\\)$`))
  }
  expect(pairOf(fs, 'discounts', 'today')).toBeUndefined()
  expect(pairOf(fs, 'box', 'today')).toBeUndefined()
  // households vs box: box's body is a plain box and sits out the body signal; raw 0.83 ≥ 0.80 still trips
  expect(pairOf(fs, 'box', 'households')?.message).toBe('silhouette matches "households" (IoU 0.83)')
  // box vs discounts: raw 0.72 is under 0.80
  expect(pairOf(fs, 'box', 'discounts')).toBeUndefined()
})

test('collision: plain box bodies never match on body alone', () => {
  const boxed = (name: string, plane: Shape, inner: Shape): Icon => ({
    name,
    brief: '',
    grid: 32,
    layers: [
      { role: 'plane', shapes: [plane] },
      { role: 'line', shapes: [inner] },
    ],
  })
  const big: Shape = { kind: 'rect', x: 5, y: 5, width: 22, height: 22, rx: 3 }
  const a = boxed('boxed-a', big, { kind: 'line', x1: 10, y1: 16, x2: 22, y2: 16 })
  const b = boxed('boxed-b', big, { kind: 'circle', cx: 16, cy: 16, r: 4 })
  // Same box body, marks inside it: the silhouettes coincide, so raw overlap (not body) flags them.
  const raw = maskIou(rasterizeMask(a, S, 24), rasterizeMask(b, S, 24))
  expect(raw).toBeGreaterThanOrEqual(S.checks.collisionIou)
  const same = collisions([a, b])
  expect(same).toHaveLength(1)
  expect(same[0]?.message).toBe(`silhouette matches "boxed-b" (IoU ${raw.toFixed(2)})`)

  // Box bodies of different sizes normalise to the same full square (body IoU 1.00) but raw is low: not flagged.
  const small = boxed('boxed-small', { kind: 'rect', x: 10, y: 10, width: 12, height: 12, rx: 2 }, {
    kind: 'line',
    x1: 13,
    y1: 16,
    x2: 19,
    y2: 16,
  })
  expect(maskIou(rasterizeMask(a, S, 24), rasterizeMask(small, S, 24))).toBeLessThan(S.checks.collisionIou)
  expect(collisions([a, small])).toHaveLength(0)
})

test('collision: at most two findings per subject, highest scores kept', () => {
  const twin = (n: string): Icon => ({ ...households, name: n })
  const fs = collisions([twin('a-house'), twin('b-house'), twin('c-house'), twin('d-house')])
  expect(fs.filter((f) => f.icon === 'a-house')).toHaveLength(2)
  expect(fs.filter((f) => f.icon === 'b-house')).toHaveLength(2)
  expect(fs.filter((f) => f.icon === 'c-house')).toHaveLength(1)
})

test('collision: an exact twin reports once, body message wins', () => {
  const fs = collisions([householdsTwin, households])
  expect(fs).toHaveLength(1)
  expect(fs[0]?.icon).toBe('households')
  expect(fs[0]?.related).toEqual(['households-twin'])
  expect(fs[0]?.message).toBe('silhouette matches "households-twin" (body IoU 1.00)')
})

test('collision: different groups never collide', () => {
  const fs = checkFamily([today, boost], S, { groups: { today: 'nav', boost: 'catalog' } })
  expect(rules(fs)).not.toContain('collision')
})

test('collision: icons without planes use only the raw signal', () => {
  // tiny-dots has no plane layer, so its body signal is skipped; raw overlap with houses is low
  expect(collisions([tinyDots, households, today])).toHaveLength(1)
  expect(pairOf(collisions([tinyDots, households, today]), 'tiny-dots', 'households')).toBeUndefined()
})

test('neighbours are compared but never reported, and neighbour-only pairs are ignored', () => {
  const c = collisions([householdsTwin], [households])
  expect(c).toHaveLength(1)
  expect(c[0]?.icon).toBe('households-twin')
  expect(c[0]?.related).toEqual(['households'])

  expect(collisions([tinyDots], [households, householdsTwin])).toHaveLength(0)
})
