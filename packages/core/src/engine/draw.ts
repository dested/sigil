import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { checkFamily } from '../checks'
import { lintIcon } from '../lint'
import type { Project } from '../project'
import { loadIcons } from '../project'
import type { SheetRow } from '../render'
import { renderSheet } from '../render'
import { parseIconSvg, serializeIcon } from '../svg'
import type { Finding, Icon, IconStyle } from '../types'
import { cacheKey, readCache, writeCache } from './cache'
import type { JobEvent, JobKind } from './jobs'
import { appendJobLog, createJob, jobDir, runWithNotes, updateJob } from './jobs'
import { DRAW_SCHEMA, DrawOutputSchema, drawPrompt, fillSystemPrompt, REVISE_SCHEMA, ReviseOutputSchema, revisePrompt } from './prompt'
import type { ClaudeJob, ClaudeResult, ClaudeRunner } from './runner'
import { createSemaphore } from './semaphore'

/** Where a batch reads references from and writes to: the project's defaults or a direction's sandbox. */
export interface DrawTarget {
  readonly style: IconStyle
  /** Where finished svgs are written. */
  readonly srcDir: string
  /** Holds jobs/ and cache/. */
  readonly sigilDir: string
  /** The house hand (style.references resolved by the caller). */
  readonly referenceIcons: readonly Icon[]
  /** Existing icons in the same groups, excluding the ones being drawn. */
  readonly neighbourIcons: readonly Icon[]
  readonly groups: Readonly<Record<string, string | undefined>>
}

export interface DrawOptions {
  readonly runner: ClaudeRunner
  readonly model: string
  readonly maxRounds: number
  readonly concurrency: number
  readonly force?: boolean
  readonly note?: string
  /** Default 10. */
  readonly batchSize?: number
  readonly onEvent?: (jobId: string, ev: JobEvent) => void
  /** Default true. */
  readonly useCache?: boolean
  /** Job kind recorded in status.json. Default 'draw'; direction samples use 'samples'. */
  readonly jobKind?: JobKind
  readonly directionId?: string
}

export interface DrawOutcome {
  readonly name: string
  readonly status: 'done' | 'unresolved' | 'cached' | 'error'
  readonly svg: string | null
  readonly findings: readonly Finding[]
  readonly rounds: number
  readonly jobId: string | null
  readonly error?: string
}

export type Brief = { readonly name: string; readonly brief: string }

export function planBatches(names: readonly string[], batchSize: number): string[][] {
  const size = Math.max(1, Math.floor(batchSize))
  const out: string[][] = []
  for (let i = 0; i < names.length; i += size) out.push(names.slice(i, i + size))
  return out
}

const errMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err))
const now = (): string => new Date().toISOString()

interface Draft {
  readonly svg: string
  /** null when the svg failed to parse. */
  readonly icon: Icon | null
  readonly parseFindings: readonly Finding[]
}

interface IconState {
  readonly name: string
  readonly brief: string
  draft: Draft | null
  /** Last draft that parsed; kept when a later revision fails to parse. */
  lastGood: Icon | null
  passed: boolean
  rationale: string
  critique: string
  findings: Finding[]
}

function toDraft(svg: string, name: string, brief: string): Draft {
  const parsed = parseIconSvg(svg, name)
  if (!parsed.ok) return { svg, icon: null, parseFindings: [...parsed.findings] }
  return { svg, icon: { ...parsed.value, brief }, parseFindings: [] }
}

function definedGroups(groups: Readonly<Record<string, string | undefined>>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [name, group] of Object.entries(groups)) if (group !== undefined) out[name] = group
  return out
}

const referenceRows = (refs: readonly Icon[]): SheetRow[] => refs.map((icon) => ({ icon, label: `${icon.name}  (reference)` }))

function writePng(file: string, rows: readonly SheetRow[], style: IconStyle, title: string): void {
  writeFileSync(file, renderSheet({ rows, style, title }).png)
}

export async function drawBatch(
  target: DrawTarget,
  briefs: readonly Brief[],
  opts: DrawOptions,
): Promise<{ jobId: string; outcomes: DrawOutcome[] }> {
  const { style, sigilDir } = target
  const names = briefs.map((b) => b.name)
  const job = createJob(sigilDir, opts.jobKind ?? 'draw', names, opts.maxRounds, {
    ...(opts.directionId !== undefined ? { directionId: opts.directionId } : {}),
  })
  const jobId = job.id
  const dir = resolve(jobDir(sigilDir, jobId))
  const log = (ev: JobEvent): void => {
    appendJobLog(sigilDir, jobId, ev)
    opts.onEvent?.(jobId, ev)
  }
  let cost = 0
  let round = 0

  try {
    const systemPromptFile = join(dir, 'system.md')
    writeFileSync(systemPromptFile, fillSystemPrompt(style))
    writeFileSync(join(dir, 'brief.json'), `${JSON.stringify(briefs, null, 2)}\n`)

    const neighboursPng = join(dir, 'neighbours.png')
    writePng(
      neighboursPng,
      [...referenceRows(target.referenceIcons), ...target.neighbourIcons.map((icon) => ({ icon, label: icon.name }))],
      style,
      'References and neighbours',
    )
    const neighbourNames = target.neighbourIcons.map((i) => i.name)
    writeFileSync(join(dir, 'neighbours.txt'), neighbourNames.map((n) => `${n}\n`).join(''))

    const states: IconState[] = briefs.map((b) => ({
      name: b.name,
      brief: b.brief,
      draft: null,
      lastGood: null,
      passed: false,
      rationale: '',
      critique: '',
      findings: [],
    }))
    const byName = new Map(states.map((s) => [s.name, s]))
    const familyNeighbours = [...target.referenceIcons, ...target.neighbourIcons]
    const checkGroups = definedGroups(target.groups)

    const baseJob: Omit<ClaudeJob, 'prompt'> = {
      cwd: dir,
      systemPromptFile,
      allowedTools: ['Read'],
      model: opts.model,
      maxTurns: 6,
    }
    const note = (message: string, r: number = round): void => log({ type: 'note', message, at: now(), round: r })
    const startRound = (n: number): void => {
      round = n
      // Written at the start so the UI shows the round in progress.
      updateJob(sigilDir, jobId, { round, costUsd: cost })
    }
    const run = async (j: ClaudeJob, what: string, forNames: readonly string[]): Promise<ClaudeResult> => {
      note(`round ${round}: ${what}: calling ${opts.model} for ${forNames.length} icons (${forNames.join(', ')})`)
      const res = await runWithNotes(opts.runner, j, round, note)
      cost += res.costUsd
      return res
    }

    const fail = (message: string): { jobId: string; outcomes: DrawOutcome[] } => {
      updateJob(sigilDir, jobId, { status: 'error', error: message, finishedAt: now(), costUsd: cost, round })
      const outcomes: DrawOutcome[] = names.map((name) => ({
        name,
        status: 'error',
        svg: null,
        findings: [],
        rounds: round,
        jobId,
        error: message,
      }))
      writeFileSync(join(dir, 'result.json'), `${JSON.stringify(outcomes, null, 2)}\n`)
      log({ type: 'error', message, at: now() })
      return { jobId, outcomes }
    }

    const evaluate = (): void => {
      const parsed = states.flatMap((s) => (s.draft?.icon != null ? [s.draft.icon] : []))
      const family = checkFamily(parsed, style, { groups: checkGroups, neighbours: familyNeighbours })
      for (const s of states) {
        if (s.draft === null) {
          s.findings = [{ icon: s.name, rule: 'engine.missing', severity: 'error', message: 'model returned no svg' }]
        } else if (s.draft.icon === null) {
          s.findings = [...s.draft.parseFindings]
        } else {
          s.findings = [...lintIcon(s.draft.icon, style), ...family.filter((f) => f.icon === s.name)]
        }
      }
    }

    const summarise = (): void => {
      const lines = states.map((s) => {
        const e = s.findings.filter((f) => f.severity === 'error').length
        const w = s.findings.length - e
        const why = s.draft !== null && s.draft.icon === null ? ` (parse failed: ${s.draft.parseFindings[0]?.message ?? 'unknown'})` : ''
        return `${s.name}: ${e} errors, ${w} warnings${s.passed ? ' ✓' : ''}${why}`
      })
      note(`round ${round} checks: ${lines.join('; ')}`)
    }

    const recordRound = (critiques: Record<string, string>): void => {
      const icons: Record<string, string> = {}
      for (const s of states) if (s.draft !== null) icons[s.name] = s.draft.svg
      const findings = states.flatMap((s) => s.findings)
      writeFileSync(join(dir, `round-${round}.json`), `${JSON.stringify({ round, findings, icons, critiques }, null, 2)}\n`)
      const drafts = states.flatMap((s) =>
        s.draft?.icon != null ? [{ icon: s.draft.icon, label: s.passed ? `${s.name}  ✓` : s.name }] : [],
      )
      writePng(join(dir, `round-${round}.png`), [...referenceRows(target.referenceIcons), ...drafts], style, `Round ${round}`)
      updateJob(sigilDir, jobId, { round, costUsd: cost })
      const errors = findings.filter((f) => f.severity === 'error').length
      const warns = findings.length - errors
      log({ type: 'round', round, message: `${drafts.length} icons, ${errors} errors, ${warns} warnings`, at: now() })
    }

    const setDraft = (s: IconState, svg: string): void => {
      s.draft = toDraft(svg, s.name, s.brief)
      if (s.draft.icon !== null) s.lastGood = s.draft.icon
    }

    // Round 1: draw.
    startRound(1)
    const first = await run(
      {
        ...baseJob,
        prompt: drawPrompt({
          briefs: [...briefs],
          groups: target.groups,
          neighboursPng,
          neighbourNames,
          referenceNames: target.referenceIcons.map((i) => i.name),
          ...(opts.note !== undefined ? { note: opts.note } : {}),
        }),
        jsonSchema: DRAW_SCHEMA,
      },
      'drawing',
      names,
    )
    const drawn = DrawOutputSchema.safeParse(first.structured)
    if (!first.ok) return fail(`claude reported an error: ${first.text.slice(0, 500)}`)
    if (!drawn.success) return fail(`model output did not match the draw schema: ${drawn.error.issues[0]?.message ?? 'invalid'}`)
    const sessionId = first.sessionId
    for (const entry of drawn.data.icons) {
      const s = byName.get(entry.name)
      if (s === undefined || s.draft !== null) continue
      setDraft(s, entry.svg)
      s.rationale = entry.rationale
    }
    evaluate()
    summarise()
    recordRound({})

    // Rounds 2..maxRounds: critique and revise in the same session.
    while (round < opts.maxRounds && states.some((s) => !s.passed)) {
      const open = states.filter((s) => !s.passed)
      const pngPath = join(dir, `round-${round}.png`)
      const findings = states.flatMap((s) => s.findings)
      startRound(round + 1)
      const res = await run(
        {
          ...baseJob,
          resume: sessionId,
          prompt: revisePrompt({ round, pngPath, findings, unresolved: open.map((s) => s.name) }),
          jsonSchema: REVISE_SCHEMA,
        },
        `revising ${open.length} unresolved`,
        open.map((s) => s.name),
      )
      const revised = ReviseOutputSchema.safeParse(res.structured)
      if (!res.ok || !revised.success) {
        const why = !res.ok ? res.text.slice(0, 300) : (revised.error?.issues[0]?.message ?? 'invalid')
        round -= 1
        updateJob(sigilDir, jobId, { round, costUsd: cost })
        log({ type: 'error', message: `round ${round + 1} revision failed, keeping round ${round} drafts: ${why}`, at: now() })
        break
      }
      const critiques: Record<string, string> = {}
      const openNames = new Set(open.map((s) => s.name))
      for (const entry of revised.data.icons) {
        const s = byName.get(entry.name)
        if (s === undefined || !openNames.has(s.name) || critiques[s.name] !== undefined) continue
        critiques[s.name] = entry.critique
        s.critique = entry.critique
        if (entry.pass) {
          // The model saw the previous round's findings; an icon with an error there cannot pass.
          if (s.draft?.icon != null && !s.findings.some((f) => f.severity === 'error')) s.passed = true
        } else if (entry.svg !== undefined) {
          setDraft(s, entry.svg)
        }
      }
      evaluate()
      summarise()
      recordRound(critiques)
    }

    // Finish.
    const refSvgs = target.referenceIcons.map(serializeIcon)
    mkdirSync(target.srcDir, { recursive: true })
    const drawnAt = now()
    const perIconCost = states.length > 0 ? cost / states.length : 0
    const outcomes: DrawOutcome[] = states.map((s) => {
      const icon = s.draft?.icon ?? s.lastGood
      if (icon === null) {
        return { name: s.name, status: 'error', svg: null, findings: s.findings, rounds: round, jobId, error: 'no draft parsed' }
      }
      const status = s.passed ? 'done' : 'unresolved'
      const svg = serializeIcon({ ...icon, brief: s.brief })
      writeFileSync(join(target.srcDir, `${s.name}.svg`), svg)
      // Direction samples share the project's .sigil but draw in another style; keep them out of its cache.
      if (opts.useCache !== false) writeCache(sigilDir, {
        name: s.name,
        key: cacheKey(style, s.name, s.brief, refSvgs),
        svg,
        rationale: s.rationale,
        critique: s.critique,
        rounds: round,
        costUsd: perIconCost,
        drawnAt,
        jobId,
        status,
      })
      return { name: s.name, status, svg, findings: s.findings, rounds: round, jobId }
    })
    writeFileSync(join(dir, 'result.json'), `${JSON.stringify(outcomes, null, 2)}\n`)
    const jobStatus = outcomes.every((o) => o.status === 'done')
      ? 'done'
      : outcomes.some((o) => o.status === 'error')
        ? 'error'
        : 'unresolved'
    updateJob(sigilDir, jobId, { status: jobStatus, finishedAt: now(), costUsd: cost, round })
    log({ type: 'done', at: now() })
    return { jobId, outcomes }
  } catch (err) {
    const message = errMessage(err)
    try {
      updateJob(sigilDir, jobId, { status: 'error', error: message, finishedAt: now(), costUsd: cost })
      log({ type: 'error', message, at: now() })
    } catch {
      // The original error is the one worth surfacing.
    }
    throw err
  }
}

function cachedOutcome(target: DrawTarget, b: Brief, refSvgs: readonly string[]): DrawOutcome | null {
  const entry = readCache(target.sigilDir, b.name)
  if (entry === null || entry.status !== 'done') return null
  if (entry.key !== cacheKey(target.style, b.name, b.brief, refSvgs)) return null
  const file = join(target.srcDir, `${b.name}.svg`)
  if (!existsSync(file)) return null
  const svg = readFileSync(file, 'utf8')
  const parsed = parseIconSvg(svg, b.name)
  const findings = parsed.ok ? lintIcon(parsed.value, target.style) : [...parsed.findings]
  return { name: b.name, status: 'cached', svg, findings, rounds: entry.rounds, jobId: entry.jobId }
}

export async function drawIcons(target: DrawTarget, briefs: readonly Brief[], opts: DrawOptions): Promise<DrawOutcome[]> {
  const useCache = opts.useCache !== false && opts.force !== true
  const refSvgs = target.referenceIcons.map(serializeIcon)
  const results = new Map<string, DrawOutcome>()
  const todo: Brief[] = []
  for (const b of briefs) {
    const hit = useCache ? cachedOutcome(target, b, refSvgs) : null
    if (hit !== null) results.set(b.name, hit)
    else todo.push(b)
  }
  const briefByName = new Map(todo.map((b) => [b.name, b]))
  const batches = planBatches(
    todo.map((b) => b.name),
    opts.batchSize ?? 10,
  )
  const limit = createSemaphore(Math.max(1, opts.concurrency))
  await Promise.all(
    batches.map((batch) =>
      limit(async () => {
        const batchBriefs = batch.flatMap((n) => {
          const b = briefByName.get(n)
          return b === undefined ? [] : [b]
        })
        const { outcomes } = await drawBatch(target, batchBriefs, opts)
        for (const o of outcomes) results.set(o.name, o)
      }),
    ),
  )
  return briefs.flatMap((b) => {
    const o = results.get(b.name)
    return o === undefined ? [] : [o]
  })
}

export function targetFromProject(project: Project, names: readonly string[]): DrawTarget {
  const style = project.style
  if (style === null) throw new Error(`${project.styleFile}: no valid icon.md style loaded`)
  const { icons } = loadIcons(project)
  const drawing = new Set(names)
  const refSet = new Set(style.references)
  const groupOf = (name: string): string => project.manifest[name]?.group ?? ''
  const wanted = new Set(names.map(groupOf))
  const referenceIcons = icons.filter((i) => refSet.has(i.name))
  // References already sit on the sheet; listing them twice would only add noise.
  const neighbourIcons = icons.filter((i) => !drawing.has(i.name) && !refSet.has(i.name) && wanted.has(groupOf(i.name)))
  const groups: Record<string, string | undefined> = {}
  for (const [name, entry] of Object.entries(project.manifest)) if (entry.group !== undefined) groups[name] = entry.group
  return { style, srcDir: project.srcDir, sigilDir: project.sigilDir, referenceIcons, neighbourIcons, groups }
}
