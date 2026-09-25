import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { Brief, CacheEntry, DrawOutcome, Finding, Icon, JobEvent, JobKind, JobRecord, Manifest, Project } from '@sigil/core'
import {
  buildCss,
  buildProject,
  checkFamily,
  drawIcons,
  generateDirections,
  drawDirectionSamples,
  iterateDirection,
  jobDir,
  lintIconSource,
  listDirections,
  listIconSources,
  listJobs,
  loadProject,
  mixDirections,
  NAME_RE,
  parseIconSvg,
  pickDirection,
  readCache,
  readDirection,
  readJob,
  readJobLog,
  suggestIcons,
  targetFromProject,
  upsertManifest,
  writeManifest,
} from '@sigil/core'
import { initTRPC, TRPCError } from '@trpc/server'
import { z } from 'zod'
import type { LabContext } from './context'
import { requireStyle } from './context'

const t = initTRPC.context<LabContext>().create()
export const publicProcedure = t.procedure

export interface IconRow {
  readonly name: string
  readonly brief: string
  readonly group?: string
  readonly svg: string | null
  readonly findings: readonly Finding[]
  readonly cache: CacheEntry | null
  readonly approved: boolean
}

export interface JobRound {
  readonly round: number
  /** `/files/jobs/<id>/round-N.png` */
  readonly png: string
  readonly findings: readonly Finding[]
  readonly critiques: Readonly<Record<string, string>>
  readonly icons: Readonly<Record<string, string>>
}

export interface JobFile {
  readonly name: string
  /** `/files/jobs/<id>/<name>` */
  readonly url: string
  readonly bytes: number
}

export type JobDetail = JobRecord & {
  readonly rounds: readonly JobRound[]
  readonly files: readonly JobFile[]
  readonly log: readonly JobEvent[]
  readonly result: readonly DrawOutcome[] | null
}

const FindingSchema = z.object({
  icon: z.string(),
  rule: z.string(),
  severity: z.enum(['error', 'warn']),
  message: z.string(),
  related: z.array(z.string()).exactOptional(),
})

/** Matches what engine/draw.ts recordRound writes. */
const RoundFileSchema = z.object({
  round: z.number(),
  findings: z.array(FindingSchema),
  icons: z.record(z.string(), z.string()),
  critiques: z.record(z.string(), z.string()),
})

const DrawOutcomeSchema = z.object({
  name: z.string(),
  status: z.enum(['done', 'unresolved', 'cached', 'error']),
  svg: z.string().nullable(),
  findings: z.array(FindingSchema),
  rounds: z.number(),
  jobId: z.string().nullable(),
  error: z.string().exactOptional(),
})

export interface FeedLine {
  readonly at: string
  readonly jobId: string
  readonly kind: JobKind
  readonly type: string
  readonly message: string
  readonly round?: number
}

export interface RunningJob {
  readonly jobId: string
  readonly kind: JobKind
  readonly names: readonly string[]
  readonly round: number
  readonly maxRounds: number
  readonly startedAt: string
}

// Deliberately not an exhaustive switch: new JobEvent variants must render without a lab change.
function feedLine(job: JobRecord, ev: JobEvent): FeedLine {
  const message = ev.type === 'done' ? 'done' : 'message' in ev && typeof ev.message === 'string' ? ev.message : JSON.stringify(ev)
  const round = 'round' in ev && typeof ev.round === 'number' ? ev.round : undefined
  return { at: ev.at, jobId: job.id, kind: job.kind, type: ev.type, message, ...(round !== undefined ? { round } : {}) }
}

function jobFiles(dir: string, id: string): JobFile[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .sort()
    .flatMap((name) => {
      const st = statSync(join(dir, name))
      return st.isFile() ? [{ name, url: `/files/jobs/${id}/${encodeURIComponent(name)}`, bytes: st.size }] : []
    })
}

const IconName = z.string().regex(NAME_RE, 'invalid icon name')
// Ids become path segments under .sigil; keep them to one safe segment.
const Id = z.string().regex(/^[A-Za-z0-9_-]+$/, 'invalid id')

function readJsonFile(file: string): unknown {
  if (!existsSync(file)) return undefined
  try {
    const data: unknown = JSON.parse(readFileSync(file, 'utf8'))
    return data
  } catch {
    return undefined
  }
}

interface SourceInfo {
  readonly svg: string
  readonly icon: Icon | null
  readonly findings: readonly Finding[]
}

/** Parsed + linted sources. Without a style only data-brief is recoverable, so findings stay empty. */
function readSources(project: Project): Map<string, SourceInfo> {
  const out = new Map<string, SourceInfo>()
  const style = project.style
  for (const { name, source } of listIconSources(project)) {
    if (style !== null) {
      const res = lintIconSource(source, name, style)
      out.set(name, { svg: source, icon: res.icon, findings: res.findings })
    } else {
      const parsed = parseIconSvg(source, name)
      out.set(name, { svg: source, icon: parsed.ok ? parsed.value : null, findings: [] })
    }
  }
  return out
}

function definedGroups(manifest: Manifest): Record<string, string> {
  const groups: Record<string, string> = {}
  for (const [name, entry] of Object.entries(manifest)) if (entry.group !== undefined) groups[name] = entry.group
  return groups
}

function buildRows(project: Project): IconRow[] {
  const sources = readSources(project)
  const family = new Map<string, Finding[]>()
  if (project.style !== null) {
    const icons = [...sources.values()].flatMap((s) => (s.icon !== null ? [s.icon] : []))
    for (const f of checkFamily(icons, project.style, { groups: definedGroups(project.manifest) })) {
      const list = family.get(f.icon) ?? []
      list.push(f)
      family.set(f.icon, list)
    }
  }
  const names = [...new Set([...Object.keys(project.manifest), ...sources.keys()])].sort()
  return names.map((name): IconRow => {
    const entry = project.manifest[name]
    const src = sources.get(name)
    return {
      name,
      brief: entry?.brief ?? src?.icon?.brief ?? '',
      ...(entry?.group !== undefined ? { group: entry.group } : {}),
      svg: src?.svg ?? null,
      findings: [...(src?.findings ?? []), ...(family.get(name) ?? [])],
      cache: readCache(project.sigilDir, name),
      approved: entry?.approved ?? false,
    }
  })
}

function rowFor(project: Project, name: string): IconRow {
  const row = buildRows(project).find((r) => r.name === name)
  if (row === undefined) throw new TRPCError({ code: 'NOT_FOUND', message: `icon ${name} not found` })
  return row
}

/** Manifest brief when non-empty, else the source's data-brief. */
function resolveBriefs(project: Project, names: readonly string[]): { briefs: Brief[]; missing: string[] } {
  const sources = readSources(project)
  const briefs: Brief[] = []
  const missing: string[] = []
  for (const name of names) {
    const fromManifest = project.manifest[name]?.brief ?? ''
    const brief = fromManifest !== '' ? fromManifest : (sources.get(name)?.icon?.brief ?? '')
    if (brief === '') missing.push(name)
    else briefs.push({ name, brief })
  }
  return { briefs, missing }
}

function engineOptions(ctx: LabContext, project: Project) {
  const { model, maxRounds, concurrency } = project.config
  return { runner: ctx.runner, model, maxRounds, concurrency }
}

function requireDirection(sigilDir: string, id: string): void {
  if (readDirection(sigilDir, id) === null) throw new TRPCError({ code: 'NOT_FOUND', message: `direction ${id} not found` })
}

function startDraw(
  ctx: LabContext,
  names: readonly string[],
  extra: { readonly force?: boolean; readonly note?: string },
): { started: number } {
  const { project } = requireStyle(ctx)
  const { briefs, missing } = resolveBriefs(project, names)
  if (missing.length > 0) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: `no brief for: ${missing.join(', ')}` })
  }
  const target = targetFromProject(project, names)
  const opts = { ...engineOptions(ctx, project), ...extra }
  ctx.tasks.start(`draw ${names.join(',')}`, () => drawIcons(target, briefs, opts))
  return { started: names.length }
}

const projectRouter = t.router({
  css: publicProcedure.query(({ ctx }): string => {
    const project = ctx.project()
    return project.style === null ? '' : buildCss(project.style)
  }),
  get: publicProcedure.query(({ ctx }) => {
    const project = ctx.project()
    return {
      root: project.root,
      hasStyle: project.style !== null,
      style: project.style,
      styleFindings: project.styleFindings,
      manifest: project.manifest,
      icons: buildRows(project),
      config: project.config,
    }
  }),
  setBrief: publicProcedure
    .input(z.object({ name: IconName, brief: z.string(), group: z.string().optional() }))
    .mutation(({ ctx, input }): IconRow => {
      const project = ctx.project()
      const manifest = upsertManifest(project.manifest, input.name, {
        brief: input.brief,
        ...(input.group !== undefined ? { group: input.group } : {}),
      })
      writeManifest(project.iconsDir, manifest)
      return rowFor(ctx.project(), input.name)
    }),
  suggest: publicProcedure
    .input(
      z.object({
        product: z.string().min(1),
        hints: z.string().optional(),
        brand: z.string().optional(),
        count: z.number().int().min(1).max(30).default(10),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const project = ctx.project()
      const args = {
        product: input.product,
        count: input.count,
        existing: Object.keys(project.manifest),
        ...(input.hints !== undefined ? { hints: input.hints } : {}),
        ...(input.brand !== undefined ? { brand: input.brand } : {}),
      }
      try {
        const { job, icons } = await suggestIcons(project, args, { runner: ctx.runner, model: project.config.model })
        return { icons, jobId: job.id, costUsd: job.costUsd }
      } catch (err) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: err instanceof Error ? err.message : String(err), cause: err })
      }
    }),
})

const iconsRouter = t.router({
  draw: publicProcedure
    .input(z.object({ names: z.array(IconName).min(1), force: z.boolean().optional() }))
    .mutation(({ ctx, input }) => {
      const names = [...new Set(input.names)]
      return startDraw(ctx, names, input.force !== undefined ? { force: input.force } : {})
    }),
  redraw: publicProcedure
    .input(z.object({ name: IconName, note: z.string() }))
    .mutation(({ ctx, input }) => startDraw(ctx, [input.name], { force: true, note: input.note })),
  approve: publicProcedure
    .input(z.object({ name: IconName, approved: z.boolean() }))
    .mutation(({ ctx, input }): IconRow => {
      const project = ctx.project()
      writeManifest(project.iconsDir, upsertManifest(project.manifest, input.name, { approved: input.approved }))
      return rowFor(ctx.project(), input.name)
    }),
})

const jobsRouter = t.router({
  list: publicProcedure.query(({ ctx }): JobRecord[] => listJobs(ctx.project().sigilDir)),
  get: publicProcedure.input(z.object({ id: Id })).query(({ ctx, input }): JobDetail => {
    const { sigilDir } = ctx.project()
    const record = readJob(sigilDir, input.id)
    if (record === null) throw new TRPCError({ code: 'NOT_FOUND', message: `job ${input.id} not found` })
    const dir = jobDir(sigilDir, input.id)
    const rounds: JobRound[] = []
    for (let n = 1; n <= record.round; n++) {
      const parsed = RoundFileSchema.safeParse(readJsonFile(join(dir, `round-${n}.json`)))
      if (!parsed.success) continue
      rounds.push({
        round: parsed.data.round,
        png: `/files/jobs/${input.id}/round-${n}.png`,
        findings: parsed.data.findings,
        critiques: parsed.data.critiques,
        icons: parsed.data.icons,
      })
    }
    const result = z.array(DrawOutcomeSchema).safeParse(readJsonFile(join(dir, 'result.json')))
    return {
      ...record,
      rounds,
      files: jobFiles(dir, input.id),
      log: readJobLog(sigilDir, input.id),
      result: result.success ? result.data : null,
    }
  }),
})

const debugRouter = t.router({
  feed: publicProcedure
    .input(z.object({ limit: z.number().int().min(1).max(5000).default(200) }).default({ limit: 200 }))
    .query(({ ctx, input }): { lines: FeedLine[]; running: RunningJob[] } => {
      const { sigilDir } = ctx.project()
      const jobs = listJobs(sigilDir)
      const lines = jobs
        .slice(0, 20)
        .flatMap((job) => readJobLog(sigilDir, job.id).map((ev) => feedLine(job, ev)))
        .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
      const running = jobs
        .filter((j) => j.status === 'running')
        .map((j) => ({ jobId: j.id, kind: j.kind, names: j.names, round: j.round, maxRounds: j.maxRounds, startedAt: j.startedAt }))
      return { lines: lines.slice(-input.limit), running }
    }),
})

const tasksRouter = t.router({
  list: publicProcedure.query(({ ctx }) => ctx.tasks.list()),
})

const directionsRouter = t.router({
  list: publicProcedure.query(({ ctx }) =>
    listDirections(ctx.project().sigilDir).map((d) => ({ ...d, css: buildCss(d.style, { scope: `.dir-${d.id}` }) })),
  ),
  generate: publicProcedure
    .input(
      z.object({
        names: z.array(IconName).min(1),
        product: z.string().min(1),
        brand: z.string().optional(),
        hints: z.string().optional(),
      }),
    )
    .mutation(({ ctx, input }) => {
      const project = ctx.project()
      const args = {
        names: input.names,
        product: input.product,
        ...(input.brand !== undefined ? { brand: input.brand } : {}),
        ...(input.hints !== undefined ? { hints: input.hints } : {}),
      }
      const opts = engineOptions(ctx, project)
      ctx.tasks.start(`directions ${input.names.join(',')}`, () => generateDirections(project, args, opts))
      return { started: true } as const
    }),
  mix: publicProcedure
    .input(z.object({ line: Id, tone: Id, radius: Id, prose: Id }))
    .mutation(({ ctx, input }) => {
      const project = ctx.project()
      for (const id of new Set([input.line, input.tone, input.radius, input.prose])) requireDirection(project.sigilDir, id)
      const sources = { line: input.line, tone: input.tone, radius: input.radius, prose: input.prose }
      const opts = engineOptions(ctx, project)
      ctx.tasks.start(`mix ${sources.line}+${sources.tone}+${sources.radius}+${sources.prose}`, () =>
        mixDirections(project, sources, opts),
      )
      return { started: true } as const
    }),
  iterate: publicProcedure
    .input(z.object({ id: Id, note: z.string().min(1) }))
    .mutation(({ ctx, input }) => {
      const project = ctx.project()
      requireDirection(project.sigilDir, input.id)
      const opts = engineOptions(ctx, project)
      ctx.tasks.start(`iterate ${input.id}`, () => iterateDirection(project, input.id, input.note, opts))
      return { started: true } as const
    }),
  drawSamples: publicProcedure.input(z.object({ id: Id })).mutation(({ ctx, input }) => {
    const project = ctx.project()
    requireDirection(project.sigilDir, input.id)
    const opts = engineOptions(ctx, project)
    ctx.tasks.start(`samples ${input.id}`, () => drawDirectionSamples(project, input.id, opts))
    return { started: true } as const
  }),
  pick: publicProcedure.input(z.object({ id: Id })).mutation(({ ctx, input }) => {
    const project = ctx.project()
    requireDirection(project.sigilDir, input.id)
    const picked = pickDirection(project, input.id)
    const build = buildProject(loadProject(ctx.root))
    return { styleFile: picked.styleFile, written: picked.written, build: { files: [...build.files] } }
  }),
})

const buildRouter = t.router({
  run: publicProcedure.mutation(({ ctx }) => {
    const { project } = requireStyle(ctx)
    const res = buildProject(project)
    return { files: [...res.files], iconCount: res.iconCount, findings: [...res.findings] }
  }),
})

export const appRouter = t.router({
  project: projectRouter,
  icons: iconsRouter,
  jobs: jobsRouter,
  tasks: tasksRouter,
  directions: directionsRouter,
  build: buildRouter,
  debug: debugRouter,
})

export type AppRouter = typeof appRouter
export const createCaller = t.createCallerFactory(appRouter)
