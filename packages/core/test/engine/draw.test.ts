import { afterAll, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readCache } from '../../src/engine/cache'
import type { DrawTarget } from '../../src/engine/draw'
import { drawIcons, planBatches } from '../../src/engine/draw'
import { jobDir, listJobs, readJob, readJobLog } from '../../src/engine/jobs'
import type { ClaudeJob } from '../../src/engine/runner'
import { parseIconSvg } from '../../src/svg'
import { FROZONE_STYLE } from '../fixtures/glyphs'
import { fakeRunner } from './fake-runner'

const svg = (inner: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${inner}</svg>`

const BOX = svg(
  '<g data-role="plane"><rect x="5" y="5" width="22" height="22" rx="3"/></g><g data-role="line"><rect x="5" y="5" width="22" height="22" rx="3"/></g>',
)
const BAD = svg('<g data-role="line"><path d="M8 8h16v16H8z" fill="red"/></g>')
const FIXED = svg(
  '<g data-role="plane"><rect x="8" y="6" width="16" height="20" rx="2"/></g><g data-role="line"><rect x="8" y="6" width="16" height="20" rx="2"/></g>',
)
const OVERFLOW = svg('<g data-role="line"><rect x="1" y="1" width="30" height="30" rx="2"/></g>')

const briefs = [
  { name: 'box', brief: 'a cardboard shipping box' },
  { name: 'bad', brief: 'a ticket & a "stub"' },
]

const temps: string[] = []
afterAll(() => {
  for (const t of temps) rmSync(t, { recursive: true, force: true })
})

function makeTarget(): DrawTarget {
  const root = mkdtempSync(join(tmpdir(), 'sigil-draw-'))
  temps.push(root)
  return {
    style: FROZONE_STYLE,
    srcDir: join(root, 'icons', 'src'),
    sigilDir: join(root, '.sigil'),
    referenceIcons: [],
    neighbourIcons: [],
    groups: {},
  }
}

const base = { model: 'opus', maxRounds: 4, concurrency: 2 }

test('planBatches splits in order', () => {
  expect(planBatches(['a', 'b', 'c', 'd', 'e'], 2)).toEqual([['a', 'b'], ['c', 'd'], ['e']])
  expect(planBatches([], 10)).toEqual([])
})

describe('drawIcons, full loop', () => {
  const target = makeTarget()
  const prompts: ClaudeJob[] = []
  const runner = fakeRunner([
    () => ({
      structured: {
        icons: [
          { name: 'box', svg: BOX, rationale: 'a box' },
          { name: 'bad', svg: BAD, rationale: 'a ticket' },
          { name: 'stranger', svg: BOX, rationale: 'ignored' },
        ],
      },
    }),
    (job) => {
      prompts.push(job)
      return {
        structured: {
          icons: [
            { name: 'box', pass: true, critique: 'ok' },
            { name: 'bad', pass: false, critique: 'fixed', svg: FIXED },
          ],
        },
      }
    },
    (job) => {
      prompts.push(job)
      return { structured: { icons: [{ name: 'bad', pass: true, critique: 'good now' }] } }
    },
  ])

  test('draws, revises and persists', async () => {
    const outcomes = await drawIcons(target, briefs, { ...base, runner })
    expect(runner.calls.length).toBe(3)
    expect(outcomes.map((o) => [o.name, o.status, o.rounds])).toEqual([
      ['box', 'done', 3],
      ['bad', 'done', 3],
    ])

    const first = runner.calls[0]
    expect(first?.jsonSchema).toBeDefined()
    expect(first?.resume).toBeUndefined()
    expect(first?.allowedTools).toEqual(['Read'])
    expect(first?.prompt).toContain('- `box`: a cardboard shipping box')

    const jobId = outcomes[0]?.jobId ?? ''
    const dir = jobDir(target.sigilDir, jobId)
    for (const f of ['system.md', 'brief.json', 'neighbours.png', 'neighbours.txt', 'round-1.png', 'round-2.png', 'round-3.png', 'result.json']) {
      expect(existsSync(join(dir, f))).toBe(true)
    }

    const round1: unknown = JSON.parse(readFileSync(join(dir, 'round-1.json'), 'utf8'))
    expect(round1).toMatchObject({ round: 1 })
    const r1Text = JSON.stringify(round1)
    expect(r1Text).toContain('"rule":"schema.attr"')
    expect(r1Text).not.toContain('stranger')

    const round2 = prompts[0]
    expect(round2?.resume).toBe('sess-1')
    expect(round2?.prompt).toContain('schema.attr')
    expect(round2?.prompt).toContain(join(dir, 'round-1.png'))
    expect(prompts[1]?.prompt).toContain('Still open this round: `bad`.')

    const round2Json = readFileSync(join(dir, 'round-2.json'), 'utf8')
    expect(round2Json).toContain('"bad": "fixed"')

    for (const b of briefs) {
      const text = readFileSync(join(target.srcDir, `${b.name}.svg`), 'utf8')
      const parsed = parseIconSvg(text, b.name)
      expect(parsed.ok).toBe(true)
      if (parsed.ok) expect(parsed.value.brief).toBe(b.brief)
      expect(text).toContain('data-sigil="1"')
      const cache = readCache(target.sigilDir, b.name)
      expect(cache?.rounds).toBe(3)
      expect(cache?.status).toBe('done')
      expect(cache?.jobId).toBe(jobId)
    }
    expect(readCache(target.sigilDir, 'bad')?.critique).toBe('good now')

    const job = readJob(target.sigilDir, jobId)
    expect(job?.status).toBe('done')
    expect(job?.round).toBe(3)
    expect(job?.costUsd).toBeCloseTo(0.03, 5)
    expect(job?.finishedAt).toBeDefined()

    const log = readJobLog(target.sigilDir, jobId)
    expect(log.filter((e) => e.type !== 'note').map((e) => e.type)).toEqual(['round', 'round', 'round', 'done'])
    const notes = log.flatMap((e) => (e.type === 'note' ? [e.message] : []))
    expect(notes).toContain('round 1: drawing: calling opus for 2 icons (box, bad)')
    expect(notes).toContain('round 2: revising 2 unresolved: calling opus for 2 icons (box, bad)')
    expect(notes).toContain('round 3: revising 1 unresolved: calling opus for 1 icons (bad)')
    expect(notes).toContain('claude: start fake --model opus')
    expect(notes).toContain('claude: exit 0')
    expect(notes).toContain('round 1: 0.0s · $0.0100 · 1 turns')
    const checks1 = notes.find((m) => m.startsWith('round 1 checks: ')) ?? ''
    expect(checks1).toMatch(/box: 0 errors, \d+ warnings/)
    expect(checks1).toMatch(/bad: 1 errors, 0 warnings \(parse failed: .+\)/)
    // Every call-start note precedes that round's round event.
    const firstRound = log.findIndex((e) => e.type === 'round')
    const firstCall = log.findIndex((e) => e.type === 'note' && e.message.startsWith('round 1: drawing'))
    expect(firstCall).toBeGreaterThanOrEqual(0)
    expect(firstCall).toBeLessThan(firstRound)

    const result: unknown = JSON.parse(readFileSync(join(dir, 'result.json'), 'utf8'))
    expect(Array.isArray(result) && result.length).toBe(2)
  })

  test('a second call is served from the cache', async () => {
    const again = fakeRunner([])
    const outcomes = await drawIcons(target, briefs, { ...base, runner: again })
    expect(again.calls.length).toBe(0)
    expect(outcomes.map((o) => o.status)).toEqual(['cached', 'cached'])
    expect(outcomes[0]?.svg).toContain('data-brief="a cardboard shipping box"')
  })

  test('force redraws', async () => {
    const forced = fakeRunner([
      () => ({ structured: { icons: briefs.map((b) => ({ name: b.name, svg: BOX, rationale: 'r' })) } }),
      () => ({ structured: { icons: briefs.map((b) => ({ name: b.name, pass: true, critique: 'ok' })) } }),
    ])
    const outcomes = await drawIcons(target, briefs, { ...base, runner: forced, force: true })
    expect(forced.calls.length).toBe(2)
    expect(outcomes.map((o) => o.status)).toEqual(['done', 'done'])
    expect(listJobs(target.sigilDir).length).toBe(2)
  })
})

test('maxRounds 1 leaves a failing icon unresolved but written', async () => {
  const target = makeTarget()
  const runner = fakeRunner([() => ({ structured: { icons: [{ name: 'overflow', svg: OVERFLOW, rationale: 'r' }] } })])
  const [o] = await drawIcons(target, [{ name: 'overflow', brief: 'too big' }], { ...base, maxRounds: 1, runner })
  expect(o?.status).toBe('unresolved')
  expect(o?.findings.some((f) => f.rule === 'keyline')).toBe(true)
  expect(existsSync(join(target.srcDir, 'overflow.svg'))).toBe(true)
  expect(readCache(target.sigilDir, 'overflow')?.status).toBe('unresolved')
  expect(readJob(target.sigilDir, o?.jobId ?? '')?.status).toBe('unresolved')
})

test('a runner error marks the job and every outcome as error', async () => {
  const target = makeTarget()
  const runner = fakeRunner([() => ({ ok: false, text: 'rate limited', structured: null })])
  const outcomes = await drawIcons(target, briefs, { ...base, runner })
  expect(outcomes.map((o) => o.status)).toEqual(['error', 'error'])
  const job = readJob(target.sigilDir, outcomes[0]?.jobId ?? '')
  expect(job?.status).toBe('error')
  expect(job?.error).toContain('rate limited')
  expect(existsSync(join(target.srcDir, 'box.svg'))).toBe(false)
})

test('a thrown runner error is recorded and rethrown', async () => {
  const target = makeTarget()
  const runner = fakeRunner([])
  await expect(drawIcons(target, briefs, { ...base, runner })).rejects.toThrow('fake runner exhausted')
  const [job] = listJobs(target.sigilDir)
  expect(job?.status).toBe('error')
  expect(readJobLog(target.sigilDir, job?.id ?? '').at(-1)?.type).toBe('error')
})

test('status.json shows the round in progress and stderr notes are capped', async () => {
  const target = makeTarget()
  const seen: number[] = []
  const lines = Array.from({ length: 60 }, (_, i) => `line ${i}`)
  const runner = fakeRunner([
    () => {
      const [job] = listJobs(target.sigilDir)
      seen.push(job?.round ?? -1)
      return { structured: { icons: [{ name: 'box', svg: BOX, rationale: 'r' }] }, stderr: lines }
    },
    () => {
      const [job] = listJobs(target.sigilDir)
      seen.push(job?.round ?? -1)
      return { structured: { icons: [{ name: 'box', pass: true, critique: 'ok' }] } }
    },
  ])
  const [o] = await drawIcons(target, [{ name: 'box', brief: 'a box' }], { ...base, runner })
  expect(seen).toEqual([1, 2])
  const notes = readJobLog(target.sigilDir, o?.jobId ?? '').flatMap((e) => (e.type === 'note' ? [e.message] : []))
  expect(notes.filter((m) => /^claude: line \d+$/.test(m)).length).toBe(50)
  expect(notes).toContain('claude: 10 more stderr lines not logged')
})
