import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { parseIconSvg, renderSheet, type Finding, type Icon } from '@sigil/core'
import { defineCommand } from 'citty'
import { commonArgs, namesArg, openProject, positionals, selectIcons, timestamp, unknownFinding } from './shared'

const isFileArg = (a: string): boolean => a.includes('/') || a.includes('\\') || a.endsWith('.svg')

export const render = defineCommand({
  meta: { name: 'render', description: 'Render a contact sheet PNG (or SVG) of icons' },
  args: {
    ...namesArg,
    out: { type: 'string', description: 'Output path (.png or .svg); default .sigil/render/<timestamp>.png' },
    title: { type: 'string', description: 'Sheet title' },
    ...commonArgs,
  },
  run({ args }) {
    const project = openProject(args.cwd)
    const style = project.style
    if (style === null) return
    const all = positionals(args)
    const files = all.filter(isFileArg)
    const names = all.filter((a) => !isFileArg(a))

    const icons: Icon[] = []
    const errors: Finding[] = []
    // No names and no files ⇒ the whole project.
    if (names.length > 0 || files.length === 0) {
      const sel = selectIcons(project, names)
      icons.push(...sel.icons)
      errors.push(...sel.unknown.map(unknownFinding))
    }
    for (const file of files) {
      const path = resolve(file)
      const name = basename(path, extname(path))
      let source: string
      try {
        source = readFileSync(path, 'utf8')
      } catch (err) {
        errors.push({ icon: name, rule: 'cli.read', severity: 'error', message: err instanceof Error ? err.message : String(err) })
        continue
      }
      const parsed = parseIconSvg(source, name)
      if (parsed.ok) icons.push(parsed.value)
      else errors.push(...parsed.findings)
    }
    if (errors.length > 0) {
      for (const f of errors) console.error(`${f.severity}  ${f.icon}  ${f.rule}  ${f.message}`)
      process.exit(1)
    }
    if (icons.length === 0) {
      console.error('nothing to render')
      process.exit(1)
    }

    icons.sort((a, b) => a.name.localeCompare(b.name))
    const sheet = renderSheet({
      rows: icons.map((icon) => ({ icon, label: icon.name })),
      style,
      ...(args.title === undefined ? {} : { title: args.title }),
    })
    const out = resolve(args.out ?? join(project.sigilDir, 'render', `${timestamp()}.png`))
    mkdirSync(dirname(out), { recursive: true })
    writeFileSync(out, out.toLowerCase().endsWith('.svg') ? sheet.svg : sheet.png)
    console.log(out)
    console.log(`${icons.length} icons, ${sheet.width}×${sheet.height}`)
  },
})
