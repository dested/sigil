import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { ClaudeJob, ClaudeResult, ClaudeRunner } from '@sigil/core'
import { TRPCError } from '@trpc/server'
import { createContext, type LabContext } from '../server/context'
import { startLab } from '../server/index'
import { createCaller } from '../server/router'
import { serveSigilFile, serveStatic } from '../server/static'
import { createTaskRegistry } from '../server/tasks'

type Responder = (job: ClaudeJob) => Partial<ClaudeResult> & { structured: unknown }

function fakeRunner(script: Responder[]): ClaudeRunner & { calls: ClaudeJob[]; push: (...r: Responder[]) => void } {
  const queue = [...script]
  const calls: ClaudeJob[] = []
  return {
    name: 'fake',
    calls,
    push: (...r) => {
      queue.push(...r)
    },
    async run(job) {
      calls.push(job)
      const next = queue.shift()
      if (next === undefined) throw new Error(`fake runner exhausted on call ${calls.length}`)
      return { ok: true, text: '', sessionId: 'sess-1', costUsd: 0.01, durationMs: 5, numTurns: 1, raw: null, ...next(job) }
    },
  }
}

const FIXTURE = resolve(import.meta.dir, '../../../fixtures/frozone')

function copyFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'sigil-lab-'))
  cpSync(join(FIXTURE, 'icon.md'), join(root, 'icon.md'))
  mkdirSync(join(root, 'icons'), { recursive: true })
  cpSync(join(FIXTURE, 'icons', 'manifest.json'), join(root, 'icons', 'manifest.json'))
  cpSync(join(FIXTURE, 'icons', 'src'), join(root, 'icons', 'src'), { recursive: true })
  return root
}

const BOX =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
  '<g data-role="plane"><rect x="5" y="5" width="22" height="22" rx="3"/></g>' +
  '<g data-role="line"><rect x="5" y="5" width="22" height="22" rx="3"/><path d="M10 12h12"/><path d="M10 17h8"/></g>' +
  '</svg>'

let root = ''
let ctx: LabContext
const runner = fakeRunner([])
const caller = (): ReturnType<typeof createCaller> => createCaller(ctx)
let jobId = ''

beforeAll(() => {
  root = copyFixture()
  ctx = createContext({ root, runner, tasks: createTaskRegistry() })
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

async function trpcCode(p: Promise<unknown>): Promise<string> {
  try {
    await p
  } catch (err) {
    if (err instanceof TRPCError) return err.code
    throw err
  }
  throw new Error('expected the call to reject')
}

describe('lab router', () => {
  test('project.get', async () => {
    const res = await caller().project.get()
    expect(res.hasStyle).toBe(true)
    expect(res.icons.length).toBe(45)
    const atRisk = res.icons.find((r) => r.name === 'at-risk')
    expect(atRisk?.svg).toContain('<svg')
    expect(atRisk?.cache).toBeNull()
    expect(atRisk?.approved).toBe(false)
    // checkFamily reports the pair once, on `boost`, with `today` as the related icon.
    const boost = res.icons.find((r) => r.name === 'boost')
    const collision = boost?.findings.find((f) => f.rule === 'collision')
    expect(collision?.message).toContain('today')
  })

  test('project.setBrief adds a manifest entry', async () => {
    const row = await caller().project.setBrief({ name: 'payroll', brief: 'a pay stub' })
    expect(row).toMatchObject({ name: 'payroll', brief: 'a pay stub', svg: null, approved: false })
    const manifest: unknown = JSON.parse(readFileSync(join(root, 'icons', 'manifest.json'), 'utf8'))
    expect(manifest).toMatchObject({ payroll: { brief: 'a pay stub' } })
  })

  test('icons.draw runs in the background and records a job', async () => {
    runner.push(
      () => ({ structured: { icons: [{ name: 'payroll', svg: BOX, rationale: 'a stub' }] } }),
      () => ({ structured: { icons: [{ name: 'payroll', pass: true, critique: 'reads well' }] } }),
    )
    expect(await caller().icons.draw({ names: ['payroll'] })).toEqual({ started: 1 })
    await ctx.tasks.wait()
    const tasks = await caller().tasks.list()
    expect(tasks[0]).toMatchObject({ label: 'draw payroll', status: 'done' })

    const jobs = await caller().jobs.list()
    expect(jobs.length).toBe(1)
    const job = jobs[0]
    if (job === undefined) throw new Error('no job')
    jobId = job.id
    expect(job.status).toBe('done')

    const detail = await caller().jobs.get({ id: jobId })
    expect(detail.rounds.length).toBe(2)
    for (const r of detail.rounds) expect(r.png.startsWith(`/files/jobs/${jobId}/round-`)).toBe(true)
    expect(detail.rounds[0]?.icons.payroll).toBeDefined()
    expect(detail.rounds[1]?.critiques.payroll).toBe('reads well')
    expect(detail.result?.[0]).toMatchObject({ name: 'payroll', status: 'done' })
    expect(detail.log.some((e) => e.type === 'done')).toBe(true)
    expect(existsSync(join(root, 'icons', 'src', 'payroll.svg'))).toBe(true)

    const payroll = (await caller().project.get()).icons.find((r) => r.name === 'payroll')
    expect(payroll?.cache?.status).toBe('done')
    expect(payroll?.svg).toContain('data-brief="a pay stub"')
  })

  test('jobs.get lists the job dir files with servable urls', async () => {
    const detail = await caller().jobs.get({ id: jobId })
    const names = detail.files.map((f) => f.name)
    expect(names).toEqual([...names].sort())
    for (const n of ['status.json', 'system.md', 'brief.json', 'round-1.png', 'result.json', 'log.jsonl']) expect(names).toContain(n)
    const status = detail.files.find((f) => f.name === 'status.json')
    expect(status?.url).toBe(`/files/jobs/${jobId}/status.json`)
    expect(status?.bytes).toBeGreaterThan(0)
    const sigilDir = join(root, '.sigil')
    const res = serveSigilFile(sigilDir, status?.url ?? '')
    expect(res?.headers.get('content-type')).toContain('application/json')
    expect(await res?.text()).toContain(jobId)
    expect(serveSigilFile(sigilDir, `/files/jobs/${jobId}/system.md`)?.headers.get('content-type')).toContain('text/markdown')
    expect(serveSigilFile(sigilDir, `/files/jobs/${jobId}/log.jsonl`)?.headers.get('content-type')).toContain('text/plain')
  })

  test('debug.feed merges job logs and reports nothing running', async () => {
    const feed = await caller().debug.feed()
    // Notes are the engine's live commentary; the milestone lines are what this asserts on.
    const mine = feed.lines.filter((l) => l.jobId === jobId && l.type !== 'note')
    expect(mine.map((l) => l.type)).toEqual(['round', 'round', 'done'])
    expect(mine[0]).toMatchObject({ kind: 'draw', round: 1 })
    expect(mine[2]?.message).toBe('done')
    const ats = feed.lines.map((l) => l.at)
    expect(ats).toEqual([...ats].sort())
    expect(feed.running).toEqual([])
    expect((await caller().debug.feed({ limit: 1 })).lines.length).toBe(1)
  })

  test('icons.approve flips the manifest flag', async () => {
    const row = await caller().icons.approve({ name: 'payroll', approved: true })
    expect(row.approved).toBe(true)
  })

  test('icons.draw without a brief is BAD_REQUEST', async () => {
    expect(await trpcCode(caller().icons.draw({ names: ['nobrief'] }))).toBe('BAD_REQUEST')
  })

  test('jobs.get on an unknown id is NOT_FOUND', async () => {
    expect(await trpcCode(caller().jobs.get({ id: 'nope' }))).toBe('NOT_FOUND')
  })

  test('directions.mix with unknown ids is NOT_FOUND', async () => {
    expect(await trpcCode(caller().directions.mix({ line: 'x', tone: 'y', radius: 'z', prose: 'w' }))).toBe('NOT_FOUND')
    expect(await caller().directions.list()).toEqual([])
  })

  test('build.run', async () => {
    const res = await caller().build.run()
    expect(res.iconCount).toBe(46)
    expect(existsSync(join(root, 'icons', 'dist', 'icons.css'))).toBe(true)
  })
})

describe('project.suggest', () => {
  test('slugifies names, drops existing ones after the retry, leaves the manifest alone', async () => {
    const dir = copyFixture()
    try {
      const list = [
        { name: 'Home Page', brief: 'a house', group: 'main' },
        { name: 'roster', brief: 'x', group: 'main' },
      ]
      const suggestRunner = fakeRunner([
        () => ({ structured: { icons: list } }),
        () => ({ structured: { icons: list.filter((i) => i.name !== 'roster') } }),
      ])
      const manifestFile = join(dir, 'icons', 'manifest.json')
      const before = readFileSync(manifestFile, 'utf8')
      const c = createCaller(createContext({ root: dir, runner: suggestRunner, tasks: createTaskRegistry() }))
      const res = await c.project.suggest({ product: 'a training facility' })
      expect(res.icons).toEqual([{ name: 'home-page', brief: 'a house', group: 'main' }])
      expect(res.jobId).not.toBe('')
      expect(res.costUsd).toBeCloseTo(0.02)
      expect(suggestRunner.calls.length).toBe(2)
      expect(readFileSync(manifestFile, 'utf8')).toBe(before)

      const failing = fakeRunner([() => ({ ok: false, text: 'rate limited', structured: null })])
      const c2 = createCaller(createContext({ root: dir, runner: failing, tasks: createTaskRegistry() }))
      expect(await trpcCode(c2.project.suggest({ product: 'x' }))).toBe('INTERNAL_SERVER_ERROR')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('static files', () => {
  test('serveSigilFile guards traversal and serves round pngs', () => {
    const sigilDir = join(root, '.sigil')
    expect(serveSigilFile(sigilDir, '/files/../icon.md')).toBeNull()
    expect(serveSigilFile(sigilDir, '/files/..%2Ficon.md')).toBeNull()
    expect(serveSigilFile(sigilDir, '/files/jobs/nope/round-1.png')).toBeNull()
    const res = serveSigilFile(sigilDir, `/files/jobs/${jobId}/round-1.png`)
    expect(res?.headers.get('content-type')).toBe('image/png')
  })

  test('serveStatic falls back to index.html and guards traversal', async () => {
    const dist = join(root, 'dist-fixture')
    mkdirSync(join(dist, 'assets'), { recursive: true })
    await Bun.write(join(dist, 'index.html'), '<!doctype html><title>lab</title>')
    await Bun.write(join(dist, 'assets', 'app.js'), 'console.log(1)')
    expect(serveStatic(dist, '/')?.headers.get('content-type')).toContain('text/html')
    expect(await serveStatic(dist, '/jobs/123')?.text()).toContain('<title>lab</title>')
    expect(serveStatic(dist, '/assets/app.js')?.headers.get('content-type')).toContain('javascript')
    expect(serveStatic(dist, '/assets/missing.js')).toBeNull()
    expect(serveStatic(dist, '/../icon.md')).toBeNull()
  })
})

describe('startLab', () => {
  test('serves tRPC and the not-built page', async () => {
    const lab = startLab({ root, port: 7499, open: false, runner: fakeRunner([]), distDir: join(root, 'no-dist') })
    try {
      expect(lab.url).toBe('http://localhost:7499')
      const api = await fetch('http://localhost:7499/trpc/project.get')
      expect(api.status).toBe(200)
      const body: unknown = await api.json()
      expect(body).toMatchObject({ result: { data: { hasStyle: true } } })
      const page = await fetch('http://localhost:7499/')
      expect(page.status).toBe(200)
      expect(page.headers.get('content-type')).toContain('text/html')
      const png = await fetch(`http://localhost:7499/files/jobs/${jobId}/round-1.png`)
      expect(png.status).toBe(200)
      expect((await fetch('http://localhost:7499/files/nope.png')).status).toBe(404)
      expect(() => startLab({ root, port: 7499, open: false, runner: fakeRunner([]) })).toThrow('port 7499 is in use; pass --port')
    } finally {
      lab.stop()
    }
  })
})
