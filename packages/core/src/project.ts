import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { z } from 'zod'
import { lintIconSource } from './lint'
import { readManifest } from './manifest'
import { parseIconMd } from './style'
import { serializeIcon } from './svg'
import type { Finding, Icon, IconStyle, Manifest } from './types'

export const ProjectConfigSchema = z.object({
  model: z.string().default('opus'),
  concurrency: z.number().int().min(1).max(8).default(3),
  port: z.number().int().default(7444),
  engine: z.enum(['cli', 'sdk']).default('cli'),
  maxRounds: z.number().int().min(1).max(8).default(4),
})
export type ProjectConfig = z.infer<typeof ProjectConfigSchema>

export interface Project {
  /** Dir containing icon.md, or the start dir when none was found. */
  readonly root: string
  readonly styleFile: string
  readonly iconsDir: string
  readonly srcDir: string
  readonly distDir: string
  readonly sigilDir: string
  readonly style: IconStyle | null
  readonly styleFindings: readonly Finding[]
  readonly manifest: Manifest
  readonly config: ProjectConfig
}

export function findProjectRoot(start: string): string {
  const origin = resolve(start)
  let dir = origin
  for (;;) {
    if (existsSync(join(dir, 'icon.md'))) return dir
    const parent = dirname(dir)
    if (parent === dir) return origin
    dir = parent
  }
}

function readConfig(sigilDir: string): ProjectConfig {
  const file = join(sigilDir, 'config.json')
  if (!existsSync(file)) return ProjectConfigSchema.parse({})
  let data: unknown
  try {
    data = JSON.parse(readFileSync(file, 'utf8'))
  } catch (err) {
    throw new Error(`.sigil/config.json: ${err instanceof Error ? err.message : String(err)}`)
  }
  const parsed = ProjectConfigSchema.safeParse(data)
  if (!parsed.success) {
    const reason = parsed.error.issues
      .map((i) => `${i.path.length > 0 ? i.path.map(String).join('.') : '(root)'}: ${i.message}`)
      .join('; ')
    throw new Error(`.sigil/config.json: ${reason}`)
  }
  return parsed.data
}

export function loadProject(start = process.cwd()): Project {
  const root = findProjectRoot(start)
  const styleFile = join(root, 'icon.md')
  const iconsDir = join(root, 'icons')
  const sigilDir = join(root, '.sigil')
  let style: IconStyle | null = null
  let styleFindings: readonly Finding[] = []
  if (existsSync(styleFile)) {
    const parsed = parseIconMd(readFileSync(styleFile, 'utf8'))
    if (parsed.ok) style = parsed.value
    else styleFindings = parsed.findings
  }
  return {
    root,
    styleFile,
    iconsDir,
    srcDir: join(iconsDir, 'src'),
    distDir: join(iconsDir, 'dist'),
    sigilDir,
    style,
    styleFindings,
    manifest: readManifest(iconsDir),
    config: readConfig(sigilDir),
  }
}

export function listIconSources(project: Project): { name: string; file: string; source: string }[] {
  if (!existsSync(project.srcDir)) return []
  return readdirSync(project.srcDir)
    .filter((f) => f.endsWith('.svg'))
    .map((f) => f.slice(0, -'.svg'.length))
    .sort()
    .map((name) => {
      const file = join(project.srcDir, `${name}.svg`)
      return { name, file, source: readFileSync(file, 'utf8') }
    })
}

/** Parses and lints every source. Icons that fail to parse are left out; their findings are kept. */
export function loadIcons(project: Project): { icons: Icon[]; findings: Finding[] } {
  const style = project.style
  if (style === null) throw new Error(`${project.styleFile}: no valid icon.md style loaded`)
  const icons: Icon[] = []
  const findings: Finding[] = []
  for (const { name, source } of listIconSources(project)) {
    const res = lintIconSource(source, name, style)
    if (res.icon !== null) icons.push(res.icon)
    findings.push(...res.findings)
  }
  return { icons, findings }
}

export function iconSourcePath(project: Project, name: string): string {
  return join(project.srcDir, `${name}.svg`)
}

export function writeIconSource(project: Project, icon: Icon): string {
  mkdirSync(project.srcDir, { recursive: true })
  const file = iconSourcePath(project, icon.name)
  writeFileSync(file, serializeIcon(icon))
  return file
}
