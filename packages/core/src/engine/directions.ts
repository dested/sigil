import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { z } from 'zod'
import { readManifest, upsertManifest, writeManifest } from '../manifest'
import type { Project } from '../project'
import { listIconSources } from '../project'
import { parseIconMd, serializeIconMd, styleToFrontmatter } from '../style'
import { parseIconSvg } from '../svg'
import type { Finding, IconStyle } from '../types'
import type { Brief, DrawOptions, DrawTarget } from './draw'
import { drawIcons } from './draw'
import { createSemaphore } from './semaphore'
import type { JobKind, JobRecord } from './jobs'
import { appendJobLog, createJob, jobDir, newJobId, runWithNotes, updateJob } from './jobs'
import {
  DIRECTIONS_SCHEMA,
  DirectionsOutputSchema,
  directionsPrompt,
  fillDirectionsPrompt,
  ITERATE_SCHEMA,
  IterateOutputSchema,
  iteratePrompt,
} from './prompt'
import type { ClaudeJob, ClaudeResult } from './runner'

export interface DirectionMeta {
  readonly id: string
  readonly letter: string
  readonly name: string
  readonly parent?: string
  readonly note?: string
  readonly createdAt: string
  readonly sampleNames: readonly string[]
}

export interface Direction extends DirectionMeta {
  readonly style: IconStyle
  readonly samples: readonly { name: string; svg: string }[]
  readonly dir: string
}

export const DirectionMetaSchema = z.object({
  id: z.string(),
  letter: z.string(),
  name: z.string(),
  parent: z.string().exactOptional(),
  note: z.string().exactOptional(),
  createdAt: z.string(),
  sampleNames: z.array(z.string()),
})

type EngineOptions = Omit<DrawOptions, 'note' | 'force'>

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
const now = (): string => new Date().toISOString()
const errMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err))

export function directionsDir(sigilDir: string): string {
  return join(sigilDir, 'directions')
}

function readSamples(dir: string): { name: string; svg: string }[] {
  const iconsDir = join(dir, 'icons')
  if (!existsSync(iconsDir)) return []
  return readdirSync(iconsDir)
    .filter((f) => f.endsWith('.svg'))
    .sort()
    .map((f) => ({ name: f.slice(0, -'.svg'.length), svg: readFileSync(join(iconsDir, f), 'utf8') }))
}

export function readDirection(sigilDir: string, id: string): Direction | null {
  const dir = join(directionsDir(sigilDir), id)
  const metaFile = join(dir, 'meta.json')
  const styleFile = join(dir, 'icon.md')
  if (!existsSync(metaFile) || !existsSync(styleFile)) return null
  let data: unknown
  try {
    data = JSON.parse(readFileSync(metaFile, 'utf8'))
  } catch {
    return null
  }
  const meta = DirectionMetaSchema.safeParse(data)
  if (!meta.success) return null
  const style = parseIconMd(readFileSync(styleFile, 'utf8'))
  if (!style.ok) return null
  return { ...meta.data, id, style: style.value, samples: readSamples(dir), dir }
}

export function listDirections(sigilDir: string): Direction[] {
  const root = directionsDir(sigilDir)
  if (!existsSync(root)) return []
  const out: Direction[] = []
  for (const id of readdirSync(root)) {
    const d = readDirection(sigilDir, id)
    if (d !== null) out.push(d)
  }
  return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
}

export function writeDirection(sigilDir: string, meta: DirectionMeta, iconMd: string): string {
  const dir = join(directionsDir(sigilDir), meta.id)
  mkdirSync(join(dir, 'icons'), { recursive: true })
  writeFileSync(join(dir, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`)
  writeFileSync(join(dir, 'icon.md'), iconMd)
  return dir
}

// ---- shared plumbing -----------------------------------------------------------------------------

const humanise = (name: string): string => name.replace(/-/g, ' ')

function briefsFor(project: Project, names: readonly string[]): Brief[] {
  return names.map((name) => {
    const brief = project.manifest[name]?.brief ?? ''
    return { name, brief: brief !== '' ? brief : humanise(name) }
  })
}

/** Sample briefs: the brief embedded in the sample svg, then the manifest, then the name. */
function sampleBriefs(project: Project, d: Direction): Brief[] {
  const embedded = new Map<string, string>()
  for (const s of d.samples) {
    const parsed = parseIconSvg(s.svg, s.name)
    if (parsed.ok && parsed.value.brief !== '') embedded.set(s.name, parsed.value.brief)
  }
  return briefsFor(project, d.sampleNames).map((b) => ({ name: b.name, brief: embedded.get(b.name) ?? b.brief }))
}

function groupsFor(project: Project): Record<string, string | undefined> {
  const groups: Record<string, string | undefined> = {}
  for (const [name, entry] of Object.entries(project.manifest)) if (entry.group !== undefined) groups[name] = entry.group
  return groups
}

/** Choosing a direction needs a handful of samples, not the whole nav: the first six names, two rounds each. */
const SAMPLE_CAP = 6
const SAMPLE_ROUNDS = 2

/** Draw (or redraw) one direction's samples on demand; returns the sample job ids. */
export async function drawDirectionSamples(project: Project, id: string, opts: EngineOptions): Promise<string[]> {
  const d = readDirection(project.sigilDir, id)
  if (d === null) throw new Error(`direction ${id} not found`)
  return drawSamples(project, d, opts)
}

async function drawSamples(project: Project, d: Direction, opts: EngineOptions): Promise<string[]> {
  const briefs = sampleBriefs(project, d)
  if (briefs.length === 0) return []
  const target: DrawTarget = {
    style: d.style,
    srcDir: join(d.dir, 'icons'),
    sigilDir: project.sigilDir,
    referenceIcons: [],
    neighbourIcons: [],
    groups: groupsFor(project),
  }
  // Drafts, not finals: two rounds is enough to judge a direction, and one batch per direction keeps the outer semaphore in charge.
  const outcomes = await drawIcons(target, briefs, {
    ...opts,
    maxRounds: Math.min(opts.maxRounds, SAMPLE_ROUNDS),
    concurrency: 1,
    useCache: false,
    jobKind: 'samples',
    directionId: d.id,
  })
  const ids: string[] = []
  for (const o of outcomes) if (o.jobId !== null && !ids.includes(o.jobId)) ids.push(o.jobId)
  return ids
}

const describeFindings = (findings: readonly Finding[]): string => findings.map((f) => f.message).join('; ')

/**
 * One structured call in its own job, with a single corrective retry in the same session.
 * `validate` returns the problems per draft (empty when all pass).
 */
async function runStyleJob<T>(
  project: Project,
  kind: JobKind,
  names: readonly string[],
  prompt: string,
  schema: Record<string, unknown>,
  opts: EngineOptions,
  accept: (res: ClaudeResult) => { value: T | null; problems: string[] },
  retryPrompt: (problems: readonly string[]) => string,
): Promise<{ job: JobRecord; value: T }> {
  const sigilDir = project.sigilDir
  const job = createJob(sigilDir, kind, names, 1)
  const dir = resolve(jobDir(sigilDir, job.id))
  const log = (ev: Parameters<typeof appendJobLog>[2]): void => {
    appendJobLog(sigilDir, job.id, ev)
    opts.onEvent?.(job.id, ev)
  }
  let cost = 0
  const note = (message: string, round: number): void => log({ type: 'note', message, at: now(), round })
  const call = (j: ClaudeJob, round: number, what: string): Promise<ClaudeResult> => {
    // Round written at the start so the UI shows the call in progress.
    updateJob(sigilDir, job.id, { round, costUsd: cost })
    note(`round ${round}: ${what}: calling ${opts.model}`, round)
    return runWithNotes(opts.runner, j, round, note)
  }
  try {
    const systemPromptFile = join(dir, 'system.md')
    writeFileSync(systemPromptFile, fillDirectionsPrompt())
    writeFileSync(join(dir, 'prompt.md'), prompt)
    const base = { cwd: dir, systemPromptFile, allowedTools: ['Read'], model: opts.model, maxTurns: 4, jsonSchema: schema }
    const first = await call({ ...base, prompt }, 1, kind)
    cost += first.costUsd
    let outcome = accept(first)
    updateJob(sigilDir, job.id, { round: 1, costUsd: cost })
    log({ type: 'round', round: 1, message: outcome.value !== null ? 'drafts valid' : `${outcome.problems.length} problems`, at: now() })
    if (outcome.value === null) {
      const second = await call({ ...base, prompt: retryPrompt(outcome.problems), resume: first.sessionId }, 2, `${kind} retry`)
      cost += second.costUsd
      outcome = accept(second)
      updateJob(sigilDir, job.id, { round: 2, costUsd: cost })
      log({ type: 'round', round: 2, message: outcome.value !== null ? 'drafts valid' : `${outcome.problems.length} problems`, at: now() })
    }
    if (outcome.value === null) throw new Error(`drafts failed validation after one retry:\n${outcome.problems.join('\n')}`)
    const done = updateJob(sigilDir, job.id, { status: 'done', finishedAt: now(), costUsd: cost })
    log({ type: 'done', at: now() })
    return { job: done, value: outcome.value }
  } catch (err) {
    const message = errMessage(err)
    try {
      updateJob(sigilDir, job.id, { status: 'error', error: message, finishedAt: now(), costUsd: cost })
      log({ type: 'error', message, at: now() })
    } catch {
      // Surface the original error.
    }
    throw err
  }
}

// ---- generate ------------------------------------------------------------------------------------

interface DraftDirection {
  readonly letter: string
  readonly name: string
  readonly iconMd: string
}

function acceptDirections(res: ClaudeResult): { value: DraftDirection[] | null; problems: string[] } {
  if (!res.ok) return { value: null, problems: [`the run failed: ${res.text.slice(0, 300)}`] }
  const parsed = DirectionsOutputSchema.safeParse(res.structured)
  if (!parsed.success) return { value: null, problems: [`output shape: ${parsed.error.issues[0]?.message ?? 'invalid'}`] }
  const problems: string[] = []
  const drafts = parsed.data.directions.map((d) => ({ ...d, letter: d.letter.trim().toUpperCase() }))
  if (drafts.length !== 5) problems.push(`expected five directions, got ${drafts.length}`)
  const seen = new Set<string>()
  for (const d of drafts) {
    if (!/^[A-Z]$/.test(d.letter) || seen.has(d.letter)) problems.push(`${d.letter}: letters must be distinct single letters A–E`)
    seen.add(d.letter)
    const style = parseIconMd(d.iconMd)
    if (!style.ok) problems.push(`${d.letter}: ${describeFindings(style.findings)}`)
  }
  return { value: problems.length === 0 ? drafts : null, problems }
}

export async function generateDirections(
  project: Project,
  args: { names: readonly string[]; product: string; brand?: string; hints?: string },
  opts: EngineOptions,
): Promise<{ jobIds: string[]; directionIds: string[] }> {
  const current = listIconSources(project).map((s) => s.name)
  const currentIconsNote =
    current.length > 0 ? `The product already has these icons in icons/src (context only): ${current.join(', ')}.` : undefined
  const prompt = directionsPrompt({
    product: args.product,
    names: briefsFor(project, args.names),
    ...(args.brand !== undefined ? { brand: args.brand } : {}),
    ...(args.hints !== undefined ? { hints: args.hints } : {}),
    ...(currentIconsNote !== undefined ? { currentIconsNote } : {}),
  })
  const { job, value: drafts } = await runStyleJob(
    project,
    'directions',
    args.names,
    prompt,
    DIRECTIONS_SCHEMA,
    opts,
    acceptDirections,
    (problems) => `These drafts failed validation:\n${problems.join('\n')}\nReturn all five again, corrected.`,
  )

  const createdAt = now()
  const directionIds: string[] = []
  for (const d of drafts) {
    const id = `${d.letter.toLowerCase()}-${job.id}`
    writeDirection(project.sigilDir, { id, letter: d.letter, name: d.name, createdAt, sampleNames: args.names.slice(0, SAMPLE_CAP) }, d.iconMd)
    directionIds.push(id)
  }

  const jobIds = [job.id]
  // The five directions draw their samples concurrently, `opts.concurrency` at a time; a sample batch is one job.
  const limit = createSemaphore(Math.max(1, opts.concurrency))
  const perDirection = await Promise.all(
    directionIds.map((id) =>
      limit(() => {
        const d = readDirection(project.sigilDir, id)
        if (d === null) throw new Error(`direction ${id} could not be read back`)
        return drawSamples(project, d, opts)
      }),
    ),
  )
  for (const ids of perDirection) jobIds.push(...ids)
  return { jobIds, directionIds }
}

// ---- mix -----------------------------------------------------------------------------------------

/** Direction ids to take each facet from. */
export interface MixSources {
  readonly line: string
  readonly tone: string
  readonly radius: string
  readonly prose: string
}

function mustRead(sigilDir: string, id: string): Direction {
  const d = readDirection(sigilDir, id)
  if (d === null) throw new Error(`direction ${id} not found or invalid`)
  return d
}

function nextLetter(sigilDir: string): string {
  const used = new Set(listDirections(sigilDir).map((d) => d.letter.toUpperCase()))
  const free = LETTERS.find((l) => !used.has(l))
  if (free === undefined) throw new Error('all letters A–Z are taken by existing directions')
  return free
}

export async function mixDirections(
  project: Project,
  sources: MixSources,
  opts: EngineOptions,
): Promise<{ id: string; jobId?: string }> {
  const sigilDir = project.sigilDir
  const line = mustRead(sigilDir, sources.line)
  const tone = mustRead(sigilDir, sources.tone)
  const radius = mustRead(sigilDir, sources.radius)
  const prose = mustRead(sigilDir, sources.prose)

  const fm = {
    ...styleToFrontmatter(prose.style),
    stroke: line.style.stroke,
    caps: line.style.caps,
    joins: line.style.joins,
    tones: styleToFrontmatter(tone.style).tones,
    radius: { ...radius.style.radius },
    optical: { ...radius.style.optical },
  }
  const iconMd = serializeIconMd(fm, prose.style.body)
  const check = parseIconMd(iconMd)
  if (!check.ok) throw new Error(`the mixed icon.md is invalid: ${describeFindings(check.findings)}`)

  const letter = nextLetter(sigilDir)
  const id = `${letter.toLowerCase()}-${newJobId()}`
  const dir = writeDirection(
    sigilDir,
    {
      id,
      letter,
      name: `Mix of ${line.letter}/${tone.letter}/${radius.letter}/${prose.letter}`,
      parent: prose.id,
      note: `line ${line.letter}, tone ${tone.letter}, radius ${radius.letter}, prose ${prose.letter}`,
      createdAt: now(),
      sampleNames: [...prose.sampleNames],
    },
    iconMd,
  )
  for (const s of prose.samples) copyFileSync(join(prose.dir, 'icons', `${s.name}.svg`), join(dir, 'icons', `${s.name}.svg`))

  // Tone is paint only and line weight is applied at render time; radius and optical size change the drawings.
  if (radius.id === prose.id) return { id }
  const [jobId] = await drawSamples(project, mustRead(sigilDir, id), opts)
  return jobId !== undefined ? { id, jobId } : { id }
}

// ---- iterate -------------------------------------------------------------------------------------

export async function iterateDirection(
  project: Project,
  id: string,
  note: string,
  opts: EngineOptions,
): Promise<{ id: string; jobId: string }> {
  const sigilDir = project.sigilDir
  const parent = mustRead(sigilDir, id)
  const accept = (res: ClaudeResult): { value: string | null; problems: string[] } => {
    if (!res.ok) return { value: null, problems: [`the run failed: ${res.text.slice(0, 300)}`] }
    const parsed = IterateOutputSchema.safeParse(res.structured)
    if (!parsed.success) return { value: null, problems: [`output shape: ${parsed.error.issues[0]?.message ?? 'invalid'}`] }
    const style = parseIconMd(parsed.data.iconMd)
    if (!style.ok) return { value: null, problems: [`${parent.letter}: ${describeFindings(style.findings)}`] }
    return { value: parsed.data.iconMd, problems: [] }
  }
  const { job, value: iconMd } = await runStyleJob(
    project,
    'iterate',
    parent.sampleNames,
    iteratePrompt({ iconMd: parent.style.raw, note }),
    ITERATE_SCHEMA,
    opts,
    accept,
    (problems) => `This draft failed validation:\n${problems.join('\n')}\nReturn it again, corrected.`,
  )

  const newId = `${parent.letter.toLowerCase()}-${newJobId()}`
  writeDirection(
    sigilDir,
    {
      id: newId,
      letter: parent.letter,
      name: parent.name,
      parent: parent.id,
      note,
      createdAt: now(),
      sampleNames: [...parent.sampleNames],
    },
    iconMd,
  )
  // The samples keep the parent's briefs; the redraw overwrites them in the new style.
  for (const s of parent.samples) copyFileSync(join(parent.dir, 'icons', `${s.name}.svg`), join(directionsDir(sigilDir), newId, 'icons', `${s.name}.svg`))
  const [samplesJob] = await drawSamples(project, mustRead(sigilDir, newId), opts)
  return { id: newId, jobId: samplesJob ?? job.id }
}

// ---- pick ----------------------------------------------------------------------------------------

export function pickDirection(project: Project, id: string): { styleFile: string; written: string[] } {
  const d = mustRead(project.sigilDir, id)
  const written: string[] = []
  const styleFile = join(project.root, 'icon.md')
  const fm = { ...styleToFrontmatter(d.style), references: [...d.sampleNames] }
  writeFileSync(styleFile, serializeIconMd(fm, d.style.body))
  written.push(styleFile)

  mkdirSync(project.srcDir, { recursive: true })
  let manifest = readManifest(project.iconsDir)
  let manifestChanged = false
  for (const s of d.samples) {
    const file = join(project.srcDir, `${s.name}.svg`)
    if (!existsSync(file)) {
      writeFileSync(file, s.svg)
      written.push(file)
    }
    if (manifest[s.name] === undefined) {
      const parsed = parseIconSvg(s.svg, s.name)
      manifest = upsertManifest(manifest, s.name, { brief: parsed.ok ? parsed.value.brief : '' })
      manifestChanged = true
    }
  }
  if (manifestChanged) {
    writeManifest(project.iconsDir, manifest)
    written.push(join(project.iconsDir, 'manifest.json'))
  }
  return { styleFile, written }
}
