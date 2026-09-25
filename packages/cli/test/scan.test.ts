import { afterAll, describe, expect, test } from 'bun:test'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { ManifestSchema } from '@sigil/core'

const CLI_DIR = resolve(import.meta.dir, '..')
const FIXTURE = resolve(CLI_DIR, '../core/test/fixtures/scan-app')
const posix = (p: string): string => p.split('\\').join('/')
// A copy outside the repo: no icon.md above it, and --write never touches the fixture.
const app = posix(mkdtempSync(join(tmpdir(), 'sigil-scan-')))
cpSync(FIXTURE, app, { recursive: true })

afterAll(() => {
  rmSync(app, { recursive: true, force: true })
})

function run(args: readonly string[]): { code: number; out: string; err: string } {
  const res = Bun.spawnSync(['bun', 'src/main.ts', ...args], { cwd: CLI_DIR, stdout: 'pipe', stderr: 'pipe' })
  return { code: res.exitCode, out: res.stdout.toString(), err: res.stderr.toString() }
}

describe('sigil scan', () => {
  test('prints the summary and the tool table', () => {
    const r = run(['scan', '--cwd', app])
    expect(r.code).toBe(0)
    expect(r.out).toContain('scanned 6 files, 15 usages, 6 tool icons, 4 utility (kept on Lucide)')
    const lines = r.out.split('\n')
    expect(lines[1]).toMatch(/^name\s+lucide\s+group\s+uses\s+brief$/)
    expect(lines[2]).toMatch(/^point-of-sale\s+ShoppingCart\s+pos\s+2\s+Point of Sale: replace/)
    expect(r.out).not.toContain('chevron-right')
    expect(existsSync(join(app, 'icons/manifest.json'))).toBe(false)
  })

  test('--all lists utilities too', () => {
    const r = run(['scan', '--cwd', app, '--all'])
    expect(r.code).toBe(0)
    expect(r.out).toContain('utility (kept on Lucide):')
    expect(r.out).toMatch(/chevron-right\s+ChevronRight/)
  })

  test('--include narrows the walk', () => {
    const r = run(['scan', '--cwd', app, '--include', 'src/routes'])
    expect(r.code).toBe(0)
    expect(r.out).toContain('scanned 3 files,')
  })

  test('--json prints the result object', () => {
    const r = run(['scan', '--cwd', app, '--json'])
    expect(r.code).toBe(0)
    const parsed: unknown = JSON.parse(r.out)
    expect(typeof parsed === 'object' && parsed !== null && 'proposals' in parsed).toBe(true)
  })

  test('--write creates icons/manifest.json with lucide fields, then is idempotent', () => {
    const first = run(['scan', '--cwd', app, '--write'])
    expect(first.code).toBe(0)
    expect(first.out).toContain('wrote icons/manifest.json (+6 new)')
    const manifest = ManifestSchema.parse(JSON.parse(readFileSync(join(app, 'icons/manifest.json'), 'utf8')))
    expect(Object.keys(manifest).sort()).toEqual(['home', 'point-of-sale', 'roster', 'roster-2', 'schedule', 'settings'])
    for (const entry of Object.values(manifest)) expect(entry.lucide).toBeDefined()
    expect(manifest['roster']?.lucide).toBe('Users')
    expect(manifest['roster']?.group).toBe('roster')

    const second = run(['scan', '--cwd', app, '--write'])
    expect(second.code).toBe(0)
    expect(second.out).toContain('wrote icons/manifest.json (+0 new)')
  })
})
