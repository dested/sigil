import { expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseIconMd, resolveGradientStops, serializeIconMd, styleToFrontmatter } from '../src/style'
import type { IconStyle } from '../src/types'

const fixture = readFileSync(join(import.meta.dir, 'fixtures', 'icon.md'), 'utf8')

function mustParse(raw: string): IconStyle {
  const r = parseIconMd(raw)
  if (!r.ok) throw new Error(JSON.stringify(r.findings))
  return r.value
}

test('parses the Frozone fixture into camelCase IconStyle', () => {
  const s = mustParse(fixture)
  expect(s.sigil).toBe(1)
  expect(s.grid).toBe(32)
  expect(s.keyline).toEqual([3, 29])
  expect(s.caps).toBe('round')
  expect(s.radius).toEqual({ sheet: 3, box: 2, bar: 1.2 })
  expect(s.roles).toEqual(['plane', 'line', 'dot'])
  expect(s.detailBudget).toEqual({ innerMarks: [2, 5], minGap: 2.5, minPx: 16 })
  expect(s.checks).toEqual({ maxInk16: 0.35, collisionIou: 0.88, collisionBody: 0.85, opticalTolerance: 3 })
  expect(s.references).toContain('at-risk')
  expect(s.tones['tile']?.bg).toEqual({ angle: 160, stops: ['#A12A4C 0%', '#7C1936 55%', '#62122B 100%'] })
  expect(s.tones['tile']?.radius).toBe('27%')
  expect(s.tones['tile']?.on).toBe('#FFFFFF')
  expect(s.tones['tile']?.scale).toBe(0.6)
  expect(s.tones['on-dark']?.on).toBe('#0F1F3A')
  expect(s.tones['inline']?.scale).toBe(0.6)
  expect(s.body.startsWith('# Icon style')).toBe(true)
  expect(s.body).toContain('## Never')
  expect(s.raw).toBe(fixture)
  expect(s.hash).toBe(createHash('sha256').update(fixture).digest('hex'))
})

test('applies defaults and the tile radius default', () => {
  const s = mustParse('---\nsigil: 1\ntones:\n  tile: { bg: "#123456", line: "#fff", plane: "#000" }\n---\nbody\n')
  expect(s.grid).toBe(32)
  expect(s.stroke).toBe(2)
  expect(s.optical).toEqual({ circle: 24, square: 22, tall: 25, wide: 25 })
  expect(s.tones['tile']?.radius).toBe('25%')
  expect(s.tones['tile']?.on).toBe('#FFFFFF')
  expect(s.body).toBe('body\n')
})

test('rejects a bad colour with style.schema', () => {
  const r = parseIconMd('---\nsigil: 1\ntones:\n  inline: { line: "crimson", plane: "#000" }\n---\n')
  expect(r.ok).toBe(false)
  if (r.ok) return
  expect(r.findings).toHaveLength(1)
  expect(r.findings[0]?.rule).toBe('style.schema')
  expect(r.findings[0]?.message).toStartWith('tones.inline.line: ')
})

test('rejects a bad gradient stop naming the stop', () => {
  const r = parseIconMd('---\nsigil: 1\ntones:\n  t: { bg: { angle: 0, stops: ["#000", "blue 50%"] }, line: "#fff", plane: "#000" }\n---\n')
  expect(r.ok).toBe(false)
  if (r.ok) return
  expect(r.findings.some((f) => f.rule === 'style.schema' && f.message.includes('"blue 50%"'))).toBe(true)
})

test('rejects missing frontmatter and bad YAML', () => {
  const a = parseIconMd('# Icon style\n')
  expect(a.ok).toBe(false)
  if (!a.ok) expect(a.findings[0]?.rule).toBe('style.frontmatter')
  const b = parseIconMd('---\nsigil: 1\n---body')
  expect(b.ok).toBe(false)
  if (!b.ok) expect(b.findings[0]?.rule).toBe('style.frontmatter')
  const c = parseIconMd('---\nsigil: [1\n---\n')
  expect(c.ok).toBe(false)
  if (!c.ok) expect(c.findings[0]?.rule).toBe('style.yaml')
})

test('requires accent on every tone when roles include accent', () => {
  const r = parseIconMd(
    '---\nsigil: 1\nroles: [plane, line, accent]\ntones:\n  a: { line: "#fff", plane: "#000", accent: "#f00" }\n  b: { line: "#fff", plane: "#000" }\n---\n',
  )
  expect(r.ok).toBe(false)
  if (r.ok) return
  expect(r.findings).toHaveLength(1)
  expect(r.findings[0]?.message).toBe('tones.b.accent: tone "b" needs an accent colour because roles include accent')
})

test('round-trips via styleToFrontmatter and serializeIconMd', () => {
  const s = mustParse(fixture)
  const text = serializeIconMd(styleToFrontmatter(s), s.body)
  expect(text.endsWith('\n')).toBe(true)
  expect(text.endsWith('\n\n')).toBe(false)
  const again = mustParse(text)
  const { raw: _r1, hash: _h1, ...a } = s
  const { raw: _r2, hash: _h2, ...b } = again
  expect(b).toEqual(a)
})

test('resolveGradientStops uses explicit offsets and spreads the rest', () => {
  expect(resolveGradientStops({ angle: 160, stops: ['#A12A4C 0%', '#7C1936 55%', '#62122B 100%'] })).toEqual([
    { color: '#A12A4C', offset: 0 },
    { color: '#7C1936', offset: 0.55 },
    { color: '#62122B', offset: 1 },
  ])
  expect(resolveGradientStops({ angle: 0, stops: ['#000', '#fff'] })).toEqual([
    { color: '#000', offset: 0 },
    { color: '#fff', offset: 1 },
  ])
  const mid = resolveGradientStops({ angle: 0, stops: ['#000', 'rgba(0, 0, 0, .5)', '#111 40%', '#222', '#333'] })
  expect(mid.map((m) => m.offset)).toEqual([0, 0.2, 0.4, 0.7, 1])
  expect(mid[1]?.color).toBe('rgba(0, 0, 0, .5)')
})
