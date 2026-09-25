import { relative, resolve } from 'node:path'
import { loadProject, proposalsToManifest, scanProject, writeManifest, type ScanProposal } from '@sigil/core'
import { defineCommand } from 'citty'
import { commonArgs } from './shared'

const COLUMNS = { name: 24, lucide: 18, group: 14, uses: 4 } as const

const cell = (s: string, width: number): string => (s.length > width ? `${s.slice(0, width - 1)}…` : s.padEnd(width))

function printTable(rows: readonly ScanProposal[]): void {
  console.log(
    `${cell('name', COLUMNS.name)}  ${cell('lucide', COLUMNS.lucide)}  ${cell('group', COLUMNS.group)}  ${'uses'.padStart(COLUMNS.uses)}  brief`,
  )
  for (const p of rows) {
    console.log(
      `${cell(p.name, COLUMNS.name)}  ${cell(p.lucide, COLUMNS.lucide)}  ${cell(p.group, COLUMNS.group)}  ${String(p.usages.length).padStart(COLUMNS.uses)}  ${p.brief}`,
    )
  }
}

export const scan = defineCommand({
  meta: { name: 'scan', description: 'Inventory lucide-react usage and propose manifest entries for tool icons' },
  args: {
    write: { type: 'boolean', description: 'Merge tool proposals into icons/manifest.json', default: false },
    include: { type: 'string', description: 'Comma-separated dir prefixes to scan (default: src,app,apps,packages)' },
    all: { type: 'boolean', description: 'Also list utility glyphs kept on Lucide', default: false },
    ...commonArgs,
  },
  run({ args }) {
    // Scan the given dir itself; the manifest goes to the enclosing sigil project (icon.md not required).
    const root = resolve(args.cwd)
    const project = loadProject(root)
    const include =
      args.include === undefined
        ? undefined
        : args.include
            .split(',')
            .map((s) => s.trim())
            .filter((s) => s.length > 0)
    const result = scanProject(root, include === undefined ? {} : { include })

    if (args.json) {
      console.log(JSON.stringify(result, null, 2))
    } else {
      console.log(
        `scanned ${result.files} files, ${result.usages.length} usages, ${result.proposals.length} tool icons, ${result.utilities.length} utility (kept on Lucide)`,
      )
      if (result.proposals.length > 0) printTable(result.proposals)
      if (args.all && result.utilities.length > 0) {
        console.log('')
        console.log('utility (kept on Lucide):')
        printTable(result.utilities)
      }
    }

    if (args.write) {
      const before = project.manifest
      const next = proposalsToManifest(result.proposals, before)
      writeManifest(project.iconsDir, next)
      const added = Object.keys(next).filter((n) => before[n] === undefined).length
      const shown = relative(root, resolve(project.iconsDir, 'manifest.json')).split('\\').join('/')
      const line = `wrote ${shown} (+${added} new)`
      if (args.json) console.error(line)
      else console.log(line)
    }
  },
})
