import { lintIconSource, listIconSources, type Finding, type IconStyle, type Project } from '@sigil/core'
import { defineCommand } from 'citty'
import { commonArgs, exitWith, namesArg, openProject, positionals, printFindings, unknownFinding } from './shared'

/** Lints raw sources (parse failures included) for `names`, or every source when empty. */
export function lintSources(project: Project, style: IconStyle, names: readonly string[]): Finding[] {
  const sources = listIconSources(project)
  const wanted = new Set(names)
  const selected = names.length === 0 ? sources : sources.filter((s) => wanted.has(s.name))
  const found = new Set(selected.map((s) => s.name))
  const findings: Finding[] = []
  for (const { name, source } of selected) findings.push(...lintIconSource(source, name, style).findings)
  for (const n of names) if (!found.has(n)) findings.push(unknownFinding(n))
  return findings
}

export const lint = defineCommand({
  meta: { name: 'lint', description: 'Structural lint of icon sources' },
  args: { ...namesArg, ...commonArgs },
  run({ args }) {
    const project = openProject(args.cwd)
    const style = project.style
    if (style === null) return
    const findings = lintSources(project, style, positionals(args))
    printFindings(findings, args.json)
    exitWith(findings)
  },
})
