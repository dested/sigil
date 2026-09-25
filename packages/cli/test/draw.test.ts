import { afterAll, describe, expect, test } from 'bun:test'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { ScriptedResult } from '../src/commands/runner'
import { writeScript } from './fixtures/fake-claude'

const CLI_DIR = resolve(import.meta.dir, '..')
const FIXTURE = resolve(CLI_DIR, '../../fixtures/frozone')
const TIMEOUT = 60_000
const temps: string[] = []

afterAll(() => {
  for (const t of temps) rmSync(t, { recursive: true, force: true })
})

/** A fresh copy of the frozone fixture; the script lives beside it, outside the project. */
function sandbox(opts: { withStyle?: boolean } = {}): { dir: string; project: string } {
  const dir = mkdtempSync(join(tmpdir(), 'sigil-draw-'))
  temps.push(dir)
  const project = join(dir, 'frozone')
  mkdirSync(join(project, 'icons'), { recursive: true })
  if (opts.withStyle !== false) cpSync(join(FIXTURE, 'icon.md'), join(project, 'icon.md'))
  cpSync(join(FIXTURE, 'icons', 'manifest.json'), join(project, 'icons', 'manifest.json'))
  cpSync(join(FIXTURE, 'icons', 'src'), join(project, 'icons', 'src'), { recursive: true })
  return { dir, project }
}

function run(args: readonly string[], script: string): { code: number; out: string; err: string } {
  const res = Bun.spawnSync(['bun', 'src/main.ts', ...args], {
    cwd: CLI_DIR,
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, SIGIL_FAKE_CLAUDE: script },
  })
  return { code: res.exitCode, out: res.stdout.toString(), err: res.stderr.toString() }
}

const SVG_BY_SHAPE = {
  stub: '<rect x="7.5" y="5.5" width="17" height="21" rx="3"/>',
  lines: '<path d="M11.5 12h9M11.5 16.5h9M11.5 21h5"/>',
}

function rectIcon(): string {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" data-sigil="1">',
    `  <g data-role="plane">${SVG_BY_SHAPE.stub}</g>`,
    `  <g data-role="line">${SVG_BY_SHAPE.stub}${SVG_BY_SHAPE.lines}</g>`,
    '</svg>',
  ].join('\n')
}

const drawRound = (names: readonly string[], svg: (name: string) => string): ScriptedResult => ({
  structured: { icons: names.map((name) => ({ name, svg: svg(name), rationale: 'r' })) },
})
const passRound = (names: readonly string[]): ScriptedResult => ({
  structured: { icons: names.map((name) => ({ name, pass: true, critique: 'ok' })) },
})

function manifestOf(project: string): Record<string, { brief?: string }> {
  const data: unknown = JSON.parse(readFileSync(join(project, 'icons', 'manifest.json'), 'utf8'))
  if (typeof data !== 'object' || data === null) throw new Error('manifest is not an object')
  return Object.fromEntries(Object.entries(data))
}

describe('sigil draw', () => {
  test(
    'draws a new icon, then serves it from the cache',
    () => {
      const { dir, project } = sandbox()
      const script = writeScript(dir, [drawRound(['payroll'], rectIcon), passRound(['payroll'])])
      const first = run(['draw', 'payroll', '--brief', 'a pay stub', '--cwd', project], script)
      expect(first.err).not.toContain('error:')
      expect(first.code).toBe(0)
      expect(first.out).toContain('done')
      expect(first.out).toContain('payroll')
      expect(first.out).toContain('1 done, 0 cached')
      expect(first.err).toContain('sigil build')
      expect(existsSync(join(project, 'icons', 'src', 'payroll.svg'))).toBe(true)
      expect(manifestOf(project).payroll?.brief).toBe('a pay stub')

      // An empty script throws on any call, so a zero exit proves the runner was never used.
      const again = run(['draw', 'payroll', '--brief', 'a pay stub', '--cwd', project], writeScript(dir, []))
      expect(again.code).toBe(0)
      expect(again.out).toContain('cached')
      expect(again.out).toContain('0 done, 1 cached')
      expect(again.err).not.toContain('sigil build')
    },
    TIMEOUT,
  )

  test(
    'refuses a name with no brief',
    () => {
      const { dir, project } = sandbox()
      const r = run(['draw', 'nobrief', '--cwd', project], writeScript(dir, []))
      expect(r.code).toBe(1)
      expect(r.err).toContain('no brief for nobrief')
    },
    TIMEOUT,
  )

  test(
    'a failed claude run is an error outcome and exits 1',
    () => {
      const { dir, project } = sandbox()
      const script = writeScript(dir, [{ ...drawRound(['payroll'], rectIcon), ok: false }])
      const r = run(['draw', 'payroll', '--brief', 'x', '--force', '--cwd', project], script)
      expect(r.code).toBe(1)
      expect(`${r.out}\n${r.err}`).toContain('error')
      expect(r.out).toContain('1 errors')
    },
    TIMEOUT,
  )

  test(
    'with no names prints usage',
    () => {
      const { dir, project } = sandbox()
      const r = run(['draw', '--cwd', project], writeScript(dir, []))
      expect(r.code).toBe(1)
      expect(r.err).toContain('usage: sigil draw')
    },
    TIMEOUT,
  )
})

const STROKES = ['1.5', '2', '2.5', '1.75', '2.25']
const LETTERS = ['A', 'B', 'C', 'D', 'E']

function directionIconMd(letter: string, stroke: string): string {
  const base = readFileSync(join(FIXTURE, 'icon.md'), 'utf8').replace('stroke: 2', `stroke: ${stroke}`)
  const lines = base.split('\n')
  const close = lines.indexOf('---', 1)
  const prose = lines.findIndex((l, i) => i > close && l.trim() !== '' && !l.startsWith('#'))
  if (prose === -1) throw new Error('fixture icon.md has no prose line')
  lines[prose] = `${letter}: ${lines[prose] ?? ''}`
  return lines.join('\n')
}

function fixtureSvg(name: string): string {
  return readFileSync(join(FIXTURE, 'icons', 'src', `${name}.svg`), 'utf8')
}

describe('sigil init', () => {
  test(
    'generates five directions with samples',
    () => {
      const { dir, project } = sandbox({ withStyle: false })
      // At stroke 2.5 booking fails legibility.ink, so its pass is refused; two rounds keeps every
      // direction at exactly two runner calls (that one ends unresolved) and the script in step.
      mkdirSync(join(project, '.sigil'))
      writeFileSync(join(project, '.sigil', 'config.json'), JSON.stringify({ maxRounds: 2, concurrency: 1 }))
      const names = ['roster', 'booking']
      const directions: ScriptedResult = {
        structured: {
          directions: LETTERS.map((letter, i) => ({
            letter,
            name: `Direction ${letter}`,
            iconMd: directionIconMd(letter, STROKES[i] ?? '2'),
          })),
        },
      }
      const samples = LETTERS.flatMap(() => [drawRound(names, fixtureSvg), passRound(names)])
      const script = writeScript(dir, [directions, ...samples])
      const r = run(['init', '--names', names.join(','), '--product', 'Frozone', '--cwd', project], script)
      expect(r.err).not.toContain('error:')
      expect(r.code).toBe(0)
      expect(readdirSync(join(project, '.sigil', 'directions'))).toHaveLength(5)
      for (const letter of LETTERS) expect(r.out).toMatch(new RegExp(`^${letter}  Direction ${letter}  \\S+  2 samples$`, 'm'))
      expect(r.out).toContain('sigil lab')
      expect(existsSync(`${script}.cursor`)).toBe(true)
      expect(readFileSync(`${script}.cursor`, 'utf8')).toBe('11')
    },
    TIMEOUT,
  )

  test(
    'refuses when icon.md already exists',
    () => {
      const { dir, project } = sandbox()
      const r = run(['init', '--names', 'roster', '--cwd', project], writeScript(dir, []))
      expect(r.code).toBe(1)
      expect(r.err).toContain('already exists')
    },
    TIMEOUT,
  )
})
