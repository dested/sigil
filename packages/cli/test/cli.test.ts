import { afterAll, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const CLI_DIR = resolve(import.meta.dir, '..')
const FIXTURE = '../../fixtures/frozone'
const posix = (p: string): string => p.split('\\').join('/')
const scratch = posix(mkdtempSync(join(tmpdir(), 'sigil-cli-')))
const empty = posix(mkdtempSync(join(tmpdir(), 'sigil-empty-')))

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true })
  rmSync(empty, { recursive: true, force: true })
})

function run(args: readonly string[]): { code: number; out: string; err: string } {
  const res = Bun.spawnSync(['bun', 'src/main.ts', ...args], { cwd: CLI_DIR, stdout: 'pipe', stderr: 'pipe' })
  return { code: res.exitCode, out: res.stdout.toString(), err: res.stderr.toString() }
}

describe('sigil cli', () => {
  test('status summarises the fixture', () => {
    const r = run(['status', '--cwd', FIXTURE])
    expect(r.code).toBe(0)
    expect(r.out).toContain('45 sources')
    expect(r.out).toContain('tile, inline, on-dark')
    expect(r.out).toContain('ok (')
  })

  test('status --json is an object', () => {
    const r = run(['status', '--cwd', FIXTURE, '--json'])
    expect(r.code).toBe(0)
    const parsed: unknown = JSON.parse(r.out)
    expect(typeof parsed).toBe('object')
  })

  test('lint passes with warnings only', () => {
    const r = run(['lint', '--cwd', FIXTURE])
    expect(r.code).toBe(0)
    expect(r.out).toContain('0 errors,')
    expect(r.out).toContain('grid.half')
  })

  test('lint of an unknown name fails', () => {
    const r = run(['lint', '--cwd', FIXTURE, 'nope'])
    expect(r.code).toBe(1)
    expect(r.out).toContain('cli.unknown')
  })

  test('lint takes several names', () => {
    const r = run(['lint', '--cwd', FIXTURE, 'boost', 'nope'])
    expect(r.code).toBe(1)
    expect(r.out).toContain('nope')
    expect(r.out).toContain('boost')
  })

  test('lint --json prints an array', () => {
    const r = run(['lint', '--cwd', FIXTURE, '--json', 'today'])
    expect(r.code).toBe(0)
    const parsed: unknown = JSON.parse(r.out)
    expect(Array.isArray(parsed)).toBe(true)
  })

  test('check finds the three-houses collision against unselected neighbours', () => {
    const r = run(['check', '--cwd', FIXTURE, 'today'])
    expect(r.code).toBe(0)
    const line = r.out.split('\n').find((l) => l.includes('collision') && /boost|households/.test(l))
    expect(line).toBeDefined()
  })

  test('render writes a PNG sheet', () => {
    const out = `${scratch}/sheet.png`
    const r = run(['render', '--cwd', FIXTURE, 'today', 'boost', '--out', out])
    expect(r.code).toBe(0)
    expect(r.out).toContain('2 icons,')
    expect(existsSync(out)).toBe(true)
    const bytes = readFileSync(out)
    expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  })

  test('render writes an SVG sheet when --out ends in .svg', () => {
    const out = `${scratch}/sheet.svg`
    const r = run(['render', '--cwd', FIXTURE, 'today', '--out', out])
    expect(r.code).toBe(0)
    expect(readFileSync(out, 'utf8').startsWith('<svg')).toBe(true)
  })

  test('render accepts an svg file path outside the project', () => {
    const out = `${scratch}/file.png`
    const src = posix(resolve(CLI_DIR, FIXTURE, 'icons/src/today.svg'))
    const r = run(['render', '--cwd', FIXTURE, src, '--out', out])
    expect(r.code).toBe(0)
    expect(existsSync(out)).toBe(true)
  })

  test('build writes dist', () => {
    const dist = `${scratch}/dist`
    const r = run(['build', '--cwd', FIXTURE, '--dist', dist])
    expect(r.code).toBe(0)
    expect(r.out).toContain('45 icons')
    expect(existsSync(`${dist}/icons.css`)).toBe(true)
  })

  test('a directory without icon.md exits 2', () => {
    const r = run(['--cwd', empty, 'status'])
    expect(r.code).toBe(2)
    expect(r.err).toContain('icon.md not found')
  })
})
