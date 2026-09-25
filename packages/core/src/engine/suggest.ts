// Propose the icon list for a product from its description: one Claude job, structured output,
// validated names. Used by the lab's "Suggest icons" button and `sigil init --suggest`.
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { z } from 'zod'
import { NAME_RE } from '../svg'
import type { Project } from '../project'
import type { JobEvent, JobRecord } from './jobs'
import { appendJobLog, createJob, jobDir, runWithNotes, updateJob } from './jobs'
import type { ClaudeJob, ClaudeResult, ClaudeRunner } from './runner'

export interface SuggestArgs {
  readonly product: string
  readonly hints?: string
  readonly brand?: string
  /** Names already in the manifest; the model must not repeat them. */
  readonly existing?: readonly string[]
  /** Default 10, max 30. */
  readonly count?: number
}

export interface SuggestOptions {
  readonly runner: ClaudeRunner
  readonly model: string
  readonly onEvent?: (jobId: string, ev: JobEvent) => void
}

export interface SuggestedIcon {
  readonly name: string
  readonly brief: string
  readonly group: string
}

export const SUGGEST_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    icons: {
      type: 'array',
      items: {
        type: 'object',
        properties: { name: { type: 'string' }, brief: { type: 'string' }, group: { type: 'string' } },
        required: ['name', 'brief', 'group'],
      },
    },
  },
  required: ['icons'],
}

export const SuggestOutputSchema = z.object({
  icons: z.array(z.object({ name: z.string(), brief: z.string().min(1), group: z.string().min(1) })).min(1),
})

const now = (): string => new Date().toISOString()

export function fillSuggestPrompt(): string {
  return readFileSync(new URL('./templates/suggest.md', import.meta.url), 'utf8')
}

export function suggestPrompt(args: SuggestArgs): string {
  const count = Math.min(30, Math.max(1, args.count ?? 10))
  const lines = [`Product: ${args.product}.`]
  if (args.hints !== undefined && args.hints.trim() !== '') lines.push(`About it: ${args.hints.trim()}`)
  if (args.brand !== undefined && args.brand.trim() !== '') lines.push(`Brand colours: ${args.brand.trim()}`)
  const existing = args.existing ?? []
  lines.push(existing.length > 0 ? `Already has icons named: ${existing.join(', ')}. Do not repeat them.` : 'It has no icons yet.')
  lines.push(`Propose exactly ${count} icons as JSON.`)
  return lines.join('\n')
}

/** Lowercase, spaces/underscores to dashes, drop anything else; '' when nothing valid remains. */
export function slugifyName(raw: string): string {
  const s = raw
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return NAME_RE.test(s) ? s : ''
}

function accept(structured: unknown, existing: ReadonlySet<string>): { icons: SuggestedIcon[]; problems: string[] } {
  const parsed = SuggestOutputSchema.safeParse(structured)
  if (!parsed.success) return { icons: [], problems: [`output shape: ${parsed.error.issues[0]?.message ?? 'invalid'}`] }
  const seen = new Set<string>()
  const icons: SuggestedIcon[] = []
  const problems: string[] = []
  for (const it of parsed.data.icons) {
    const name = slugifyName(it.name)
    if (name === '') problems.push(`"${it.name}" is not a valid kebab-case name`)
    else if (existing.has(name)) problems.push(`"${name}" already exists`)
    else if (seen.has(name)) problems.push(`"${name}" is listed twice`)
    else {
      seen.add(name)
      icons.push({ name, brief: it.brief.trim(), group: it.group.trim().toLowerCase() })
    }
  }
  return { icons, problems }
}

export async function suggestIcons(
  project: Project,
  args: SuggestArgs,
  opts: SuggestOptions,
): Promise<{ job: JobRecord; icons: SuggestedIcon[] }> {
  const sigilDir = project.sigilDir
  const existing = new Set(args.existing ?? Object.keys(project.manifest))
  const job = createJob(sigilDir, 'suggest', [], 1)
  const dir = resolve(jobDir(sigilDir, job.id))
  const log = (ev: JobEvent): void => {
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
    writeFileSync(systemPromptFile, fillSuggestPrompt())
    const prompt = suggestPrompt({ ...args, existing: [...existing] })
    writeFileSync(join(dir, 'prompt.md'), prompt)
    const base = { cwd: dir, systemPromptFile, allowedTools: ['Read'], model: opts.model, maxTurns: 3, jsonSchema: SUGGEST_SCHEMA }
    const first = await call({ ...base, prompt }, 1, 'suggesting icons')
    cost += first.costUsd
    if (!first.ok) throw new Error(`the run failed: ${first.text.slice(0, 300)}`)
    let outcome = accept(first.structured, existing)
    updateJob(sigilDir, job.id, { round: 1, costUsd: cost })
    log({ type: 'round', round: 1, message: `${outcome.icons.length} icons, ${outcome.problems.length} problems`, at: now() })
    if (outcome.icons.length === 0 || outcome.problems.length > 0) {
      const retry = `These entries were rejected:\n${outcome.problems.join('\n')}\nReturn the full list again, corrected.`
      const second = await call({ ...base, prompt: retry, resume: first.sessionId }, 2, 'retrying rejected entries')
      cost += second.costUsd
      if (second.ok) {
        const again = accept(second.structured, existing)
        if (again.icons.length > 0) outcome = again
      }
      updateJob(sigilDir, job.id, { round: 2, costUsd: cost })
      log({ type: 'round', round: 2, message: `${outcome.icons.length} icons, ${outcome.problems.length} problems`, at: now() })
    }
    if (outcome.icons.length === 0) throw new Error(`no valid icons proposed:\n${outcome.problems.join('\n')}`)
    writeFileSync(join(dir, 'result.json'), `${JSON.stringify(outcome.icons, null, 2)}\n`)
    const done = updateJob(sigilDir, job.id, { status: 'done', finishedAt: now(), costUsd: cost, names: outcome.icons.map((i) => i.name) })
    log({ type: 'done', at: now() })
    return { job: done, icons: outcome.icons }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    updateJob(sigilDir, job.id, { status: 'error', finishedAt: now(), costUsd: cost, error: message })
    log({ type: 'error', message, at: now() })
    throw err
  }
}
