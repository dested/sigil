import { resolve } from 'node:path'
import { loadProject, type Project } from '@sigil/core'
import { startLab } from '@sigil/lab/server'
import { defineCommand } from 'citty'
import { errMessage, fail, parseCount } from './draw'
import { pickRunner } from './runner'

export const lab = defineCommand({
  meta: { name: 'lab', description: 'Open the Sigil lab: directions, drawing and review in the browser' },
  args: {
    port: { type: 'string', description: 'Port (default: config, 7444)' },
    open: { type: 'boolean', description: 'Open the browser (--no-open to skip)', default: true },
    cwd: { type: 'string', description: 'Project directory (default: current)', default: '.' },
  },
  async run({ args }) {
    const root = resolve(args.cwd)
    const port = parseCount('port', args.port)
    // No openProject: the lab is where a project without icon.md gets one.
    let project: Project
    try {
      project = loadProject(root)
    } catch (err) {
      return fail(errMessage(err))
    }
    let server: ReturnType<typeof startLab>
    try {
      server = startLab({ root, port: port ?? project.config.port, open: args.open, runner: pickRunner(project) })
    } catch (err) {
      return fail(errMessage(err))
    }
    process.on('SIGINT', () => {
      server.stop()
      process.exit(0)
    })
    await new Promise<never>(() => {})
  },
})
