import { expect, test } from 'bun:test'
import { parseIconSvg, serializeIcon, xmlEscape, xmlUnescape } from '../src/svg'
import type { Finding, Icon } from '../src/types'

const icon: Icon = {
  name: 'at-risk',
  brief: 'a badge with a warning dot',
  grid: 32,
  layers: [
    { role: 'plane', shapes: [{ kind: 'path', d: 'M6 6H26V26H6Z' }] },
    {
      role: 'line',
      shapes: [
        { kind: 'circle', cx: 12.5, cy: 10.5, r: 5.5 },
        { kind: 'rect', x: 4, y: 4, width: 24, height: 24, rx: 3 },
        { kind: 'rect', x: 8, y: 8, width: 2, height: 2, rx: 0 },
      ],
    },
    { role: 'plane', shapes: [{ kind: 'polyline', points: [[4, 4], [10.25, 12], [16, 4.5]] }] },
    { role: 'line', shapes: [{ kind: 'line', x1: 3, y1: 29, x2: 29, y2: 3.125 }] },
    { role: 'dot', shapes: [{ kind: 'circle', cx: 23.6, cy: 25.6, r: 1.15 }] },
  ],
}

const svg = (body: string, attrs = 'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" data-sigil="1"'): string =>
  `<svg ${attrs}>${body}</svg>`

function rules(source: string, name = 'cart'): string[] {
  const r = parseIconSvg(source, name)
  return r.ok ? [] : r.findings.map((f: Finding) => f.rule)
}

test('serialize → parse round-trips every shape kind across interleaved groups', () => {
  const text = serializeIcon(icon)
  const r = parseIconSvg(text, 'at-risk')
  expect(r.ok).toBe(true)
  if (r.ok) expect(r.value).toEqual(icon)
  expect(serializeIcon(icon)).toBe(text)
})

test('serializer emits the canonical form', () => {
  const text = serializeIcon({
    name: 'x',
    brief: '',
    grid: 32,
    layers: [{ role: 'line', shapes: [{ kind: 'circle', cx: 12, cy: 10.5, r: 1.1500001 }, { kind: 'line', x1: 1, y1: 2, x2: 3, y2: 4 }] }],
  })
  expect(text).toBe(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" data-sigil="1">\n' +
      '  <g data-role="line"><circle cx="12" cy="10.5" r="1.15"/><line x1="1" y1="2" x2="3" y2="4"/></g>\n' +
      '</svg>\n',
  )
})

test('brief escaping round-trips', () => {
  const brief = `Bob's "cart" & co <x>`
  const withBrief: Icon = { ...icon, brief }
  const text = serializeIcon(withBrief)
  expect(text).toContain('data-brief="Bob\'s &quot;cart&quot; &amp; co &lt;x&gt;"')
  const r = parseIconSvg(text, 'at-risk')
  expect(r.ok).toBe(true)
  if (r.ok) expect(r.value.brief).toBe(brief)
  expect(xmlUnescape(xmlEscape(brief))).toBe(brief)
  expect(xmlUnescape('&#65;&#x42;&apos;')).toBe("AB'")
})

test('comments and the xml prolog are ignored', () => {
  const source = `<?xml version="1.0" encoding="UTF-8"?>\n<!-- drawn by sigil -->\n${svg(
    '\n  <!-- outline -->\n  <g data-role="line"><circle cx="16" cy="16" r="8"/></g>\n',
  )}\n<!-- end -->\n`
  const r = parseIconSvg(source, 'cart')
  expect(r.ok).toBe(true)
  if (r.ok) expect(r.value.layers).toEqual([{ role: 'line', shapes: [{ kind: 'circle', cx: 16, cy: 16, r: 8 }] }])
})

test('forbidden attribute', () => {
  expect(rules(svg('<g data-role="line"><circle cx="16" cy="16" r="8" fill="red"/></g>'))).toEqual(['schema.attr'])
  const r = parseIconSvg(svg('<g data-role="line"><circle cx="16" cy="16" r="8" fill="red"/></g>'), 'cart')
  if (!r.ok) expect(r.findings[0]?.message).toBe('circle has forbidden attribute "fill"')
})

test('missing and non-numeric attributes', () => {
  expect(rules(svg('<g data-role="line"><circle cx="16" cy="16"/></g>'))).toEqual(['schema.attr'])
  expect(rules(svg('<g data-role="line"><circle cx="16" cy="abc" r="2"/></g>'))).toEqual(['schema.attr'])
  expect(rules(svg('<g data-role="line"><polyline points="1,2 3"/></g>'))).toEqual(['schema.attr'])
})

test('forbidden element', () => {
  expect(rules(svg('<g data-role="line"><circle cx="16" cy="16" r="8"/><text x="1">hi</text></g>'))).toEqual(['schema.element'])
})

test('bad viewBox', () => {
  expect(rules(svg('<g data-role="line"><circle cx="16" cy="16" r="8"/></g>', 'viewBox="0 0 32 24"'))).toEqual(['schema.viewbox'])
  expect(rules(svg('<g data-role="line"><circle cx="16" cy="16" r="8"/></g>', 'xmlns="x"'))).toEqual(['schema.viewbox'])
})

test('unknown role', () => {
  expect(rules(svg('<g data-role="shadow"><circle cx="16" cy="16" r="8"/></g>'))).toContain('schema.role')
})

test('empty group and no groups', () => {
  expect(rules(svg('<g data-role="line"></g>'))).toEqual(['schema.empty'])
  expect(rules(svg(''))).toEqual(['schema.empty'])
})

test('bad name', () => {
  expect(rules(svg('<g data-role="line"><circle cx="16" cy="16" r="8"/></g>'), 'Shopping_Cart')).toEqual(['schema.name'])
})

test('malformed markup', () => {
  expect(rules(svg('<g data-role="line"><circle cx="16" cy="16" r="8"/></g>stray'))).toEqual(['schema.parse'])
  expect(rules('<svg viewBox="0 0 32 32"><g data-role="line"><circle cx="16" cy="16" r="8"/></g>')).toEqual(['schema.parse'])
  expect(rules('<svg viewBox="0 0 32 32"><g data-role="line"><circle cx="16"')).toContain('schema.parse')
})

test('collects multiple findings in one parse', () => {
  const r = rules(
    svg('<g data-role="line" class="x"><circle cx="16" cy="16" r="8" stroke="red"/><text/></g><g data-role="glow"><rect x="1" y="1" width="2"/></g><g data-role="dot"></g>', 'viewBox="0 0 32"'),
    'Bad Name',
  )
  expect(r).toEqual(
    expect.arrayContaining(['schema.name', 'schema.viewbox', 'schema.attr', 'schema.element', 'schema.role', 'schema.empty']),
  )
  expect(r.length).toBeGreaterThanOrEqual(7)
})
