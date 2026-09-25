import { existsSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { generateDirections, listDirections, loadProject, upsertManifest, writeManifest, type Project } from '@sigil/core'
import { defineCommand } from 'citty'
import { engineOrFail, errMessage, fail, printProgress, validNamesOrFail } from './draw'
import { pickRunner } from './runner'
import { commonArgs } from './shared'

const MAX_DEFAULT_NAMES = 12

function load(root: string): Project {
  try {
    return loadProject(root)
  } catch (err) {
    return fail(errMessage(err))
  }
}

const splitList = (s: string): string[] =>
  s
    .split(',')
    .map((n) => n.trim())
    .filter((n) => n.length > 0)

export const init = defineCommand({
  meta: { name: 'init', description: 'Generate five style directions to start icon.md from' },
  args: {
    product: { type: 'string', description: 'Product name (default: directory name)' },
    names: { type: 'string', description: 'Comma-separated sample icon names (default: manifest, up to 12)' },
    brand: { type: 'string', description: 'Brand colours, e.g. "#8A1E3D, #0F1F3A"' },
    hints: { type: 'string', description: 'Free-text direction for the style' },
    model: { type: 'string', description: 'Claude model (default: config)' },
    engine: { type: 'string', description: 'cli | sdk (default: config)' },
    ...commonArgs,
  },
  async run({ args }) {
    const root = resolve(args.cwd)
    const engine = engineOrFail(args.engine)
    let project = load(root)
    // loadProject walks up to an ancestor's icon.md; that is a project too, so refuse either way.
    if (existsSync(join(root, 'icon.md')) || existsSync(project.styleFile)) {
      fail('icon.md already exists; use the lab to iterate')
    }

    const names = args.names !== undefined ? splitList(args.names) : Object.keys(project.manifest).slice(0, MAX_DEFAULT_NAMES)
    if (names.length === 0) fail('no names: pass --names a,b,c or create icons/manifest.json')
    validNamesOrFail(names)

    // generateDirections reads briefs from the manifest.
    const missing = names.filter((n) => project.manifest[n] === undefined)
    if (missing.length > 0) {
      let manifest = project.manifest
      for (const n of missing) manifest = upsertManifest(manifest, n, { brief: '' })
      writeManifest(project.iconsDir, manifest)
      project = load(root)
    }

    const config = project.config
    let directionIds: string[]
    try {
      const result = await generateDirections(
        project,
        {
          names,
          product: args.product ?? basename(root),
          ...(args.brand !== undefined ? { brand: args.brand } : {}),
          ...(args.hints !== undefined ? { hints: args.hints } : {}),
        },
        {
          runner: pickRunner(project, engine),
          model: args.model ?? config.model,
          maxRounds: config.maxRounds,
          concurrency: config.concurrency,
          onEvent: printProgress,
        },
      )
      directionIds = result.directionIds
    } catch (err) {
      return fail(`error: ${errMessage(err)}`)
    }

    const wanted = new Set(directionIds)
    const directions = listDirections(project.sigilDir).filter((d) => wanted.has(d.id))
    if (args.json) {
      const rows = directions.map((d) => ({ id: d.id, letter: d.letter, name: d.name, samples: d.samples.length }))
      console.log(JSON.stringify(rows, null, 2))
      return
    }
    for (const d of directions) console.log(`${d.letter}  ${d.name}  ${d.id}  ${d.samples.length} samples`)
    console.log('open the lab to compare, mix and pick: sigil lab')
  },
})
