import { checkFamily, type Finding } from '@sigil/core'
import { defineCommand } from 'citty'
import { lintSources } from './lint'
import { commonArgs, exitWith, namesArg, openProject, positionals, printFindings, selectIcons } from './shared'

export const check = defineCommand({
  meta: { name: 'check', description: 'Lint plus raster checks (legibility, optical size, collisions)' },
  args: { ...namesArg, ...commonArgs },
  run({ args }) {
    const project = openProject(args.cwd)
    const style = project.style
    if (style === null) return
    const names = positionals(args)
    const lintFindings = lintSources(project, style, names)
    // The family check always sees every parsed icon so collisions with unselected neighbours surface.
    const { icons } = selectIcons(project, [])
    const groups: Record<string, string> = {}
    for (const [name, entry] of Object.entries(project.manifest)) {
      if (entry.group !== undefined) groups[name] = entry.group
    }
    const wanted = new Set(names)
    // Pair findings are reported once, on the lexically first name, so a selected icon may only appear in `related`.
    const touches = (f: Finding): boolean => wanted.has(f.icon) || (f.related ?? []).some((r) => wanted.has(r))
    const family = checkFamily(icons, style, { groups }).filter((f) => names.length === 0 || touches(f))
    const findings: Finding[] = [...lintFindings, ...family]
    printFindings(findings, args.json)
    exitWith(findings)
  },
})
