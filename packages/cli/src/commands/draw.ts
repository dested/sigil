import {
  drawIcons,
  iconSourcePath,
  NAME_RE,
  readJob,
  targetFromProject,
  upsertManifest,
  writeManifest,
  type Brief,
  type DrawOutcome,
  type JobEvent,
  type Manifest,
} from '@sigil/core'
import { defineCommand } from 'citty'
import { parseEngine, pickRunner } from './runner'
import { commonArgs, openProject, positionals } from './shared'

export const errMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err))

export function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

/** A positive integer flag, or undefined when absent. */
export function parseCount(flag: string, value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const n = Number(value)
  if (!Number.isInteger(n) || n < 1) fail(`--${flag} must be a positive integer, got ${value}`)
  return n
}

export function engineOrFail(value: string | undefined): 'cli' | 'sdk' | undefined {
  try {
    return parseEngine(value)
  } catch (err) {
    return fail(errMessage(err))
  }
}

export function validNamesOrFail(names: readonly string[]): void {
  const bad = names.filter((n) => !NAME_RE.test(n))
  if (bad.length > 0) fail(`invalid icon name: ${bad.join(', ')} (lowercase words joined by -)`)
}

/** Job progress on stderr, one line per event. */
export function printProgress(jobId: string, ev: JobEvent): void {
  switch (ev.type) {
    case 'round':
      console.error(`[${jobId}] round ${ev.round}: ${ev.message}`)
      return
    case 'done':
      console.error(`[${jobId}] done`)
      return
    case 'error':
      console.error(`[${jobId}] error: ${ev.message}`)
      return
    case 'note':
      // Claude's own stderr chatter only with SIGIL_VERBOSE; the engine's step notes always.
      if (ev.message.startsWith('claude:') && process.env.SIGIL_VERBOSE === undefined) return
      console.error(`[${jobId}] · ${ev.message}`)
      return
  }
}

/** Sum of costUsd recorded in the status files of these jobs. */
export function jobsCost(sigilDir: string, jobIds: Iterable<string>): number {
  let total = 0
  for (const id of new Set(jobIds)) total += readJob(sigilDir, id)?.costUsd ?? 0
  return total
}

function outcomeLine(o: DrawOutcome, path: string): string {
  const errors = o.findings.filter((f) => f.severity === 'error').length
  const warnings = o.findings.length - errors
  const where = o.svg === null ? '-' : path
  return `${o.status.padEnd(10)} ${o.name.padEnd(24)} rounds ${o.rounds}  ${errors} errors/${warnings} warnings  ${where}`
}

const USAGE = 'usage: sigil draw <names…> [--brief "<text>"] [--group g] [--note "<text>"] [--force] [--concurrency n] [--rounds n] [--model m] [--engine cli|sdk] [--json]'

export const draw = defineCommand({
  meta: { name: 'draw', description: 'Draw icons from their briefs with Claude' },
  args: {
    names: { type: 'positional', description: 'Icon names to draw', required: false },
    brief: { type: 'string', description: 'Brief for the icon (exactly one name); saved to the manifest' },
    group: { type: 'string', description: 'Group recorded in the manifest for these names' },
    note: { type: 'string', description: 'Extra direction for this run only' },
    force: { type: 'boolean', description: 'Redraw even when the cache is current', default: false },
    concurrency: { type: 'string', description: 'Parallel batches (default: config)' },
    rounds: { type: 'string', description: 'Max critique rounds (default: config)' },
    model: { type: 'string', description: 'Claude model (default: config)' },
    engine: { type: 'string', description: 'cli | sdk (default: config)' },
    ...commonArgs,
  },
  async run({ args }) {
    const names = positionals(args)
    if (names.length === 0) fail(USAGE)
    validNamesOrFail(names)
    if (args.brief !== undefined && names.length !== 1) fail('--brief takes exactly one name')
    const concurrency = parseCount('concurrency', args.concurrency)
    const rounds = parseCount('rounds', args.rounds)
    const engine = engineOrFail(args.engine)

    let project = openProject(args.cwd)
    if (args.brief !== undefined || args.group !== undefined) {
      let manifest: Manifest = project.manifest
      for (const name of names) {
        manifest = upsertManifest(manifest, name, {
          ...(args.brief !== undefined ? { brief: args.brief } : {}),
          ...(args.group !== undefined ? { group: args.group } : {}),
        })
      }
      writeManifest(project.iconsDir, manifest)
      project = openProject(args.cwd)
    }

    const briefs: Brief[] = []
    for (const name of names) {
      const brief = project.manifest[name]?.brief ?? ''
      if (brief.trim() === '') fail(`no brief for ${name}: add it to icons/manifest.json or pass --brief`)
      briefs.push({ name, brief })
    }

    const config = project.config
    const started = Date.now()
    let outcomes: DrawOutcome[]
    try {
      outcomes = await drawIcons(targetFromProject(project, names), briefs, {
        runner: pickRunner(project, engine),
        model: args.model ?? config.model,
        maxRounds: rounds ?? config.maxRounds,
        concurrency: concurrency ?? config.concurrency,
        force: args.force,
        ...(args.note !== undefined ? { note: args.note } : {}),
        onEvent: printProgress,
      })
    } catch (err) {
      return fail(`error: ${errMessage(err)}`)
    }
    const elapsed = ((Date.now() - started) / 1000).toFixed(1)

    if (args.json) {
      console.log(JSON.stringify(outcomes, null, 2))
    } else {
      for (const o of outcomes) console.log(outcomeLine(o, iconSourcePath(project, o.name)))
      const count = (s: DrawOutcome['status']): number => outcomes.filter((o) => o.status === s).length
      // Cached outcomes point at an earlier job whose cost was paid then.
      const jobIds = outcomes.flatMap((o) => (o.status !== 'cached' && o.jobId !== null ? [o.jobId] : []))
      const cost = jobsCost(project.sigilDir, jobIds)
      console.log(
        `${count('done')} done, ${count('cached')} cached, ${count('unresolved')} unresolved, ${count('error')} errors · $${cost.toFixed(2)} · ${elapsed}s`,
      )
    }
    if (!outcomes.every((o) => o.status === 'cached')) console.error('run `sigil build` to regenerate icons/dist')
    process.exit(outcomes.some((o) => o.status === 'error') ? 1 : 0)
  },
})
