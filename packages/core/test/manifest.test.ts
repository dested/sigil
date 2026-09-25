import { afterEach, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readManifest, upsertManifest, writeManifest } from '../src/manifest'
import { findProjectRoot, listIconSources, loadIcons, loadProject, writeIconSource } from '../src/project'

const dirs: string[] = []
function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'sigil-core-'))
  dirs.push(d)
  return d
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

test('reading an absent manifest yields {}', () => {
  expect(readManifest(join(tempDir(), 'icons'))).toEqual({})
})

test('write then read round-trips with sorted keys', () => {
  const iconsDir = join(tempDir(), 'icons')
  const m = { orders: { brief: 'a clipboard', group: 'nav' }, 'at-risk': { brief: 'a badge', approved: true }, cart: { brief: 'a cart', lucide: 'ShoppingCart' } }
  writeManifest(iconsDir, m)
  const text = readFileSync(join(iconsDir, 'manifest.json'), 'utf8')
  expect(Object.keys(JSON.parse(text))).toEqual(['at-risk', 'cart', 'orders'])
  expect(text.endsWith('}\n')).toBe(true)
  expect(text).toContain('\n  "at-risk": {\n    "brief"')
  expect(readManifest(iconsDir)).toEqual(m)
})

test('invalid entry or invalid JSON throws', () => {
  const iconsDir = join(tempDir(), 'icons')
  mkdirSync(iconsDir, { recursive: true })
  writeFileSync(join(iconsDir, 'manifest.json'), JSON.stringify({ cart: { group: 'x' } }))
  expect(() => readManifest(iconsDir)).toThrow(/^icons\/manifest\.json: /)
  writeFileSync(join(iconsDir, 'manifest.json'), JSON.stringify({ Cart: { brief: 'x' } }))
  expect(() => readManifest(iconsDir)).toThrow(/^icons\/manifest\.json: /)
  writeFileSync(join(iconsDir, 'manifest.json'), '{ nope')
  expect(() => readManifest(iconsDir)).toThrow(/^icons\/manifest\.json: /)
})

test('upsertManifest is pure and defaults brief for new entries', () => {
  const m = { cart: { brief: 'a cart' } }
  const next = upsertManifest(m, 'cart', { approved: true })
  expect(next).toEqual({ cart: { brief: 'a cart', approved: true } })
  expect(m).toEqual({ cart: { brief: 'a cart' } })
  expect(upsertManifest(m, 'orders', { group: 'nav' })['orders']).toEqual({ brief: '', group: 'nav' })
})

test('loadProject finds icon.md upward and loads icons', () => {
  const root = tempDir()
  writeFileSync(join(root, 'icon.md'), readFileSync(join(import.meta.dir, 'fixtures', 'icon.md'), 'utf8'))
  const nested = join(root, 'a', 'b')
  mkdirSync(nested, { recursive: true })
  expect(findProjectRoot(nested)).toBe(root)
  const project = loadProject(nested)
  expect(project.root).toBe(root)
  expect(project.style?.grid).toBe(32)
  expect(project.config).toEqual({ model: 'opus', concurrency: 3, port: 7444, engine: 'cli', maxRounds: 4 })
  const file = writeIconSource(project, {
    name: 'cart',
    brief: 'a cart',
    grid: 32,
    layers: [{ role: 'line', shapes: [{ kind: 'circle', cx: 16, cy: 16, r: 8 }, { kind: 'circle', cx: 12, cy: 16, r: 1 }, { kind: 'circle', cx: 20, cy: 16, r: 1 }] }],
  })
  expect(file).toBe(join(root, 'icons', 'src', 'cart.svg'))
  writeFileSync(join(project.srcDir, 'broken.svg'), '<svg viewBox="0 0 32 32"></svg>')
  expect(listIconSources(project).map((s) => s.name)).toEqual(['broken', 'cart'])
  const { icons, findings } = loadIcons(project)
  expect(icons.map((i) => i.name)).toEqual(['cart'])
  expect(findings.map((f) => `${f.icon}:${f.rule}`)).toEqual(['broken:schema.empty'])
})

test('invalid .sigil/config.json throws', () => {
  const root = tempDir()
  mkdirSync(join(root, '.sigil'))
  writeFileSync(join(root, '.sigil', 'config.json'), JSON.stringify({ concurrency: 99 }))
  expect(() => loadProject(root)).toThrow(/^\.sigil\/config\.json: /)
})
