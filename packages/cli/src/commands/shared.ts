import { resolve } from 'node:path'
import { hasErrors, loadIcons, loadProject, type Finding, type Icon, type Project } from '@sigil/core'

export const commonArgs = {
  cwd: { type: 'string', description: 'Project directory (default: current)', default: '.' },
  json: { type: 'boolean', description: 'Machine-readable output', default: false },
} as const

export const namesArg = {
  names: { type: 'positional', description: 'Icon names (default: all)', required: false },
} as const

export function openProject(cwd: string): Project {
  const project = loadProject(resolve(cwd))
  if (project.style === null) {
    if (project.styleFindings.length === 0) console.error(`icon.md not found at ${project.root}`)
    else for (const f of project.styleFindings) console.error(`${f.severity}  ${f.rule}  ${f.message}`)
    process.exit(2)
  }
  return project
}

export function selectIcons(
  project: Project,
  names: readonly string[],
): { icons: Icon[]; findings: Finding[]; unknown: string[] } {
  const { icons, findings } = loadIcons(project)
  if (names.length === 0) return { icons, findings, unknown: [] }
  const wanted = new Set(names)
  // A source that failed to parse still exists; it is not "unknown".
  const present = new Set([...icons.map((i) => i.name), ...findings.map((f) => f.icon)])
  return {
    icons: icons.filter((i) => wanted.has(i.name)),
    findings: findings.filter((f) => wanted.has(f.icon)),
    unknown: names.filter((n) => !present.has(n)),
  }
}

export function unknownFinding(icon: string): Finding {
  return { icon, rule: 'cli.unknown', severity: 'error', message: `no source icons/src/${icon}.svg` }
}

/** Every positional after the subcommand; citty 0.2 collects them all on `args._`. */
export function positionals(args: { readonly _: readonly string[] }): string[] {
  return args._.filter((a) => a.length > 0)
}

const cell = (s: string, width: number): string => s.padEnd(width)

export function printFindings(findings: readonly Finding[], json: boolean): void {
  if (json) {
    console.log(JSON.stringify(findings, null, 2))
    return
  }
  const errors = findings.filter((f) => f.severity === 'error')
  const warnings = findings.filter((f) => f.severity !== 'error')
  for (const f of [...errors, ...warnings]) {
    console.log(`${cell(f.severity, 5)}  ${cell(f.icon, 24)}  ${cell(f.rule, 18)}  ${f.message}`)
  }
  console.log(findings.length === 0 ? 'clean' : `${errors.length} errors, ${warnings.length} warnings`)
}

export function exitWith(findings: readonly Finding[]): never {
  process.exit(hasErrors(findings) ? 1 : 0)
}

const pad2 = (n: number): string => String(n).padStart(2, '0')

export function timestamp(): string {
  const d = new Date()
  const date = `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`
  return `${date}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`
}
