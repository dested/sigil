import { resolve } from 'node:path'
import { buildProject, hasErrors } from '@sigil/core'
import { defineCommand } from 'citty'
import { commonArgs, openProject, printFindings } from './shared'

export const build = defineCommand({
  meta: { name: 'build', description: 'Build icons/dist (react, css, sprite, flat, sheet)' },
  args: {
    dist: { type: 'string', description: 'Output directory (default: icons/dist)' },
    verbose: { type: 'boolean', description: 'Also print warnings', default: false },
    ...commonArgs,
  },
  run({ args }) {
    const project = openProject(args.cwd)
    const result = buildProject(project, args.dist === undefined ? undefined : { distDir: resolve(args.dist) })
    const failed = hasErrors(result.findings)
    if (args.json) {
      console.log(JSON.stringify(result, null, 2))
    } else {
      console.log(`${result.iconCount} icons → ${result.distDir}`)
      console.log(`${result.files.length} files`)
      const shown = args.verbose ? result.findings : result.findings.filter((f) => f.severity === 'error')
      if (shown.length > 0) printFindings(shown, false)
    }
    process.exit(failed ? 1 : 0)
  },
})
