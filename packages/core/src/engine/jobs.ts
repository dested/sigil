import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import type { ClaudeJob, ClaudeResult, ClaudeRunner, RunnerEvent } from './runner'

export type JobKind = 'draw' | 'directions' | 'samples' | 'iterate' | 'suggest'
export type JobStatus = 'running' | 'done' | 'error' | 'unresolved'

export interface JobRecord {
  readonly id: string
  readonly kind: JobKind
  readonly names: readonly string[]
  readonly status: JobStatus
  readonly round: number
  readonly maxRounds: number
  readonly startedAt: string
  readonly finishedAt?: string
  readonly costUsd: number
  readonly error?: string
  readonly directionId?: string
}

export type JobEvent =
  | { readonly type: 'round'; readonly round: number; readonly icon?: string; readonly message: string; readonly at: string }
  | { readonly type: 'done'; readonly at: string }
  | { readonly type: 'error'; readonly message: string; readonly at: string }
  | { readonly type: 'note'; readonly message: string; readonly at: string; readonly round?: number }

export const JobRecordSchema = z.object({
  id: z.string(),
  kind: z.enum(['draw', 'directions', 'samples', 'iterate', 'suggest']),
  names: z.array(z.string()),
  status: z.enum(['running', 'done', 'error', 'unresolved']),
  round: z.number(),
  maxRounds: z.number(),
  startedAt: z.string(),
  finishedAt: z.string().exactOptional(),
  costUsd: z.number(),
  error: z.string().exactOptional(),
  directionId: z.string().exactOptional(),
})

export const JobEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('round'),
    round: z.number(),
    icon: z.string().exactOptional(),
    message: z.string(),
    at: z.string(),
  }),
  z.object({ type: z.literal('done'), at: z.string() }),
  z.object({ type: z.literal('error'), message: z.string(), at: z.string() }),
  z.object({ type: z.literal('note'), message: z.string(), at: z.string(), round: z.number().exactOptional() }),
])

const pad = (n: number, w = 2): string => String(n).padStart(w, '0')

export function newJobId(): string {
  const d = new Date()
  const date = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
  const time = `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  const hex = Math.floor(Math.random() * 0x10000)
    .toString(16)
    .padStart(4, '0')
  return `${date}-${time}-${hex}`
}

export const jobsDir = (sigilDir: string): string => join(sigilDir, 'jobs')

export function jobDir(sigilDir: string, id: string): string {
  return join(jobsDir(sigilDir), id)
}

const statusFile = (sigilDir: string, id: string): string => join(jobDir(sigilDir, id), 'status.json')

function writeStatus(sigilDir: string, job: JobRecord): void {
  writeFileSync(statusFile(sigilDir, job.id), `${JSON.stringify(job, null, 2)}\n`)
}

export function createJob(
  sigilDir: string,
  kind: JobKind,
  names: readonly string[],
  maxRounds: number,
  extra?: { directionId?: string },
): JobRecord {
  let id = newJobId()
  while (existsSync(jobDir(sigilDir, id))) id = newJobId()
  mkdirSync(jobDir(sigilDir, id), { recursive: true })
  const job: JobRecord = {
    id,
    kind,
    names: [...names],
    status: 'running',
    round: 0,
    maxRounds,
    startedAt: new Date().toISOString(),
    costUsd: 0,
    ...(extra?.directionId !== undefined ? { directionId: extra.directionId } : {}),
  }
  writeStatus(sigilDir, job)
  return job
}

export function readJob(sigilDir: string, id: string): JobRecord | null {
  const file = statusFile(sigilDir, id)
  if (!existsSync(file)) return null
  let data: unknown
  try {
    data = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
  const parsed = JobRecordSchema.safeParse(data)
  return parsed.success ? parsed.data : null
}

export function updateJob(sigilDir: string, id: string, patch: Partial<JobRecord>): JobRecord {
  const current = readJob(sigilDir, id)
  if (current === null) throw new Error(`job ${id}: status.json is missing or invalid`)
  const next: JobRecord = { ...current, ...patch, id: current.id }
  writeStatus(sigilDir, next)
  return next
}

export function appendJobLog(sigilDir: string, id: string, ev: JobEvent): void {
  appendFileSync(join(jobDir(sigilDir, id), 'log.jsonl'), `${JSON.stringify(ev)}\n`)
}

export function readJobLog(sigilDir: string, id: string): JobEvent[] {
  const file = join(jobDir(sigilDir, id), 'log.jsonl')
  if (!existsSync(file)) return []
  const out: JobEvent[] = []
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (line.trim() === '') continue
    let data: unknown
    try {
      data = JSON.parse(line)
    } catch {
      continue
    }
    const parsed = JobEventSchema.safeParse(data)
    if (parsed.success) out.push(parsed.data)
  }
  return out
}

export function listJobs(sigilDir: string): JobRecord[] {
  const dir = jobsDir(sigilDir)
  if (!existsSync(dir)) return []
  const jobs: JobRecord[] = []
  for (const id of readdirSync(dir)) {
    const job = readJob(sigilDir, id)
    if (job !== null) jobs.push(job)
  }
  return jobs.sort((a, b) => (a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : b.id.localeCompare(a.id)))
}

/** Stderr notes kept per runner call; the rest are counted in one closing note. */
export const STDERR_NOTE_CAP = 50

const secs = (ms: number): string => (ms / 1000).toFixed(1)

/**
 * Runs one Claude call and narrates it into the job log as notes: the runner's start / stderr / end
 * events (stderr capped at STDERR_NOTE_CAP) and a closing `round N: <s>s · $<cost> · <n> turns` line.
 */
export async function runWithNotes(
  runner: ClaudeRunner,
  job: ClaudeJob,
  round: number,
  note: (message: string, round: number) => void,
): Promise<ClaudeResult> {
  let stderrLines = 0
  const onEvent = (e: RunnerEvent): void => {
    switch (e.type) {
      case 'start':
        note(`claude: start ${e.argv.join(' ')}`, round)
        return
      case 'stderr':
        stderrLines++
        if (stderrLines <= STDERR_NOTE_CAP) note(`claude: ${e.line}`, round)
        return
      case 'end':
        note(`claude: exit ${e.exitCode}`, round)
        return
    }
  }
  const res = await runner.run(job, onEvent)
  if (stderrLines > STDERR_NOTE_CAP) note(`claude: ${stderrLines - STDERR_NOTE_CAP} more stderr lines not logged`, round)
  note(`round ${round}: ${secs(res.durationMs)}s · $${res.costUsd.toFixed(4)} · ${res.numTurns} turns${res.ok ? '' : ' · is_error'}`, round)
  return res
}
