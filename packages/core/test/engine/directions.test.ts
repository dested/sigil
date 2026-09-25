import { afterAll, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  generateDirections,
  iterateDirection,
  listDirections,
  mixDirections,
  pickDirection,
  readDirection,
} from '../../src/engine/directions'
import { readJob } from '../../src/engine/jobs'
import type { ClaudeJob } from '../../src/engine/runner'
import { readManifest, writeManifest } from '../../src/manifest'
import type { Project } from '../../src/project'
import { loadProject } from '../../src/project'
import { parseIconMd, serializeIconMd, styleToFrontmatter } from '../../src/style'
import { fakeRunner } from './fake-runner'
import type { Responder } from './fake-runner'

const fixture = parseIconMd(readFileSync(join(import.meta.dir, '..', 'fixtures', 'icon.md'), 'utf8'))
if (!fixture.ok) throw new Error('fixture icon.md must parse')
const baseFm = { ...styleToFrontmatter(fixture.value), references: [] }
const body = '# Icon style\n\nTest prose.\n'

const STROKES: Readonly<Record<string, number>> = { A: 1.5, B: 2, C: 2.5, D: 1.75, E: 2.25 }
const iconMdFor = (letter: string): string =>
  serializeIconMd(
    {
      ...baseFm,
      stroke: STROKES[letter] ?? 2,
      radius: letter === 'B' ? { sheet: 5 } : baseFm.radius,
      tones: letter === 'B' ? { inline: { line: '#123456', plane: '#ABCDEF', on: '#FFFFFF' } } : baseFm.tones,
    },
    `${body}\nDirection ${letter}.\n`,
  )

const svg = (inner: string): string => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${inner}</svg>`
const SAMPLES: Readonly<Record<string, string>> = {
  box: svg(
    '<g data-role="plane"><rect x="5" y="5" width="22" height="22" rx="3"/></g><g data-role="line"><rect x="5" y="5" width="22" height="22" rx="3"/></g>',
  ),
  ring: svg('<g data-role="line"><circle cx="16" cy="16" r="10"/><path d="M16 10v6"/><path d="M16 16h4"/></g>'),
}
const NAMES = ['box', 'ring']

/**
 * A fresh session draws every requested name; a resumed one passes them all. Answering by job rather
 * than by position keeps the script valid when directions draw their samples concurrently.
 */
const sampleResponder: Responder = (job: ClaudeJob) =>
  job.resume === undefined
    ? {
        structured: {
          icons: NAMES.filter((n) => job.prompt.includes(`\`${n}\``)).map((name) => ({ name, svg: SAMPLES[name] ?? '', rationale: 'r' })),
        },
      }
    : { structured: { icons: NAMES.map((name) => ({ name, pass: true, critique: 'ships' })) } }
const sampleRounds = (): Responder[] => [sampleResponder, sampleResponder]

const temps: string[] = []
afterAll(() => {
  for (const t of temps) rmSync(t, { recursive: true, force: true })
})
const tempRoot = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'sigil-dir-'))
  temps.push(root)
  return root
}

const opts = { model: 'opus', maxRounds: 2, concurrency: 2 }

describe('directions', () => {
  const root = tempRoot()
  writeManifest(join(root, 'icons'), { box: { brief: 'a shipping box' }, ring: { brief: '' } })
  const project: Project = loadProject(root)
  const ids: Record<string, string> = {}

  test('generateDirections writes five directions with samples', async () => {
    const runner = fakeRunner([
      () => ({ structured: { directions: ['A', 'B', 'C', 'D', 'E'].map((letter) => ({ letter, name: `Dir ${letter}`, iconMd: iconMdFor(letter) })) } }),
      ...Array.from({ length: 5 }, sampleRounds).flat(),
    ])
    const res = await generateDirections(project, { names: NAMES, product: 'Frozone' }, { ...opts, runner })
    expect(runner.remaining()).toBe(0)
    expect(res.directionIds.length).toBe(5)
    expect(res.jobIds.length).toBe(6)
    expect(readJob(project.sigilDir, res.jobIds[0] ?? '')?.kind).toBe('directions')
    const samplesJob = readJob(project.sigilDir, res.jobIds[1] ?? '')
    expect(samplesJob?.kind).toBe('samples')
    expect(samplesJob?.directionId).toBe(res.directionIds[0])

    const prompt = runner.calls[0]?.prompt ?? ''
    expect(prompt).toContain('Product: Frozone.')
    expect(prompt).toContain('- box: a shipping box')
    expect(prompt).toContain('- ring: ring')
    expect(prompt).toContain('No brand colours given')

    const dirs = listDirections(project.sigilDir)
    expect(dirs.map((d) => d.letter)).toEqual(['A', 'B', 'C', 'D', 'E'])
    for (const d of dirs) {
      ids[d.letter] = d.id
      expect(existsSync(join(d.dir, 'meta.json'))).toBe(true)
      expect(existsSync(join(d.dir, 'icon.md'))).toBe(true)
      expect(d.samples.map((s) => s.name)).toEqual(NAMES)
      expect(d.sampleNames).toEqual(NAMES)
    }
    expect(dirs[0]?.style.stroke).toBe(1.5)
    // Direction samples draw in another style and must not pollute the project's cache.
    expect(existsSync(join(project.sigilDir, 'cache', 'box.json'))).toBe(false)
  })

  test('a draft that fails validation is retried once in the same session', async () => {
    const good = ['A', 'B', 'C', 'D', 'E'].map((letter) => ({ letter, name: `Dir ${letter}`, iconMd: iconMdFor(letter) }))
    const bad = good.map((d, i) => (i === 2 ? { ...d, iconMd: 'no frontmatter' } : d))
    const scratch = loadProject(tempRoot())
    const runner = fakeRunner([
      () => ({ structured: { directions: bad }, sessionId: 'sess-dir' }),
      () => ({ structured: { directions: bad } }),
    ])
    await expect(generateDirections(scratch, { names: [], product: 'X' }, { ...opts, runner })).rejects.toThrow('failed validation')
    expect(runner.calls[1]?.resume).toBe('sess-dir')
    expect(runner.calls[1]?.prompt).toContain('These drafts failed validation:\nC:')
  })

  test('mix with radius from the prose source reuses the samples', async () => {
    const runner = fakeRunner([])
    const res = await mixDirections(
      project,
      { line: ids.A ?? '', tone: ids.B ?? '', radius: ids.A ?? '', prose: ids.A ?? '' },
      { ...opts, runner },
    )
    expect(res.jobId).toBeUndefined()
    const d = readDirection(project.sigilDir, res.id)
    expect(d?.letter).toBe('F')
    expect(d?.name).toBe('Mix of A/B/A/A')
    expect(d?.parent).toBe(ids.A)
    expect(d?.style.stroke).toBe(1.5)
    expect(Object.keys(d?.style.tones ?? {})).toEqual(['inline'])
    expect(d?.style.tones.inline?.line).toBe('#123456')
    expect(d?.samples.map((s) => s.name)).toEqual(NAMES)
  })

  test('mix with radius from another source redraws', async () => {
    const runner = fakeRunner(sampleRounds())
    const res = await mixDirections(
      project,
      { line: ids.C ?? '', tone: ids.A ?? '', radius: ids.B ?? '', prose: ids.A ?? '' },
      { ...opts, runner },
    )
    expect(res.jobId).toBeDefined()
    const d = readDirection(project.sigilDir, res.id)
    expect(d?.letter).toBe('G')
    expect(d?.style.radius).toEqual({ sheet: 5 })
    expect(d?.style.stroke).toBe(2.5)
    expect(runner.calls[0]?.prompt).toContain('- `box`: a shipping box')
  })

  test('iterateDirection makes a child direction and redraws its samples', async () => {
    const revised = iconMdFor('A').replace('stroke: 1.5', 'stroke: 1.8')
    const runner = fakeRunner([() => ({ structured: { iconMd: revised, changes: 'thicker' } }), ...sampleRounds()])
    const res = await iterateDirection(project, ids.A ?? '', 'a bit heavier', { ...opts, runner })
    expect(runner.calls[0]?.prompt).toContain('The developer asks: "a bit heavier"')
    const d = readDirection(project.sigilDir, res.id)
    expect(d?.parent).toBe(ids.A)
    expect(d?.letter).toBe('A')
    expect(d?.name).toBe('Dir A')
    expect(d?.note).toBe('a bit heavier')
    expect(d?.style.stroke).toBe(1.8)
    expect(readJob(project.sigilDir, res.jobId)?.kind).toBe('samples')
  })

  test('pickDirection writes icon.md and missing samples', () => {
    const pickRoot = tempRoot()
    const srcDir = join(pickRoot, 'icons', 'src')
    mkdirSync(srcDir, { recursive: true })
    writeFileSync(join(srcDir, 'box.svg'), 'EXISTING')
    const target: Project = { ...project, root: pickRoot, iconsDir: join(pickRoot, 'icons'), srcDir, styleFile: join(pickRoot, 'icon.md') }
    const res = pickDirection(target, ids.B ?? '')
    expect(res.styleFile).toBe(join(pickRoot, 'icon.md'))
    const style = parseIconMd(readFileSync(res.styleFile, 'utf8'))
    expect(style.ok).toBe(true)
    if (style.ok) {
      expect(style.value.references).toEqual(NAMES)
      expect(style.value.stroke).toBe(2)
    }
    expect(readFileSync(join(srcDir, 'box.svg'), 'utf8')).toBe('EXISTING')
    expect(readFileSync(join(srcDir, 'ring.svg'), 'utf8')).toContain('data-role="line"')
    expect(res.written).toContain(join(srcDir, 'ring.svg'))
    expect(res.written).not.toContain(join(srcDir, 'box.svg'))
    const manifest = readManifest(join(pickRoot, 'icons'))
    expect(manifest.box?.brief).toBe('a shipping box')
    expect(manifest.ring?.brief).toBe('ring')
  })
})
