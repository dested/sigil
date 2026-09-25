import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ClaudeRunner } from '@sigil/core'
import { listJobs, loadProject, resolveRunner, updateJob } from '@sigil/core'
import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { createContext } from './context'
import { openBrowser } from './open'
import { appRouter } from './router'
import { serveSigilFile, serveStatic } from './static'
import { createTaskRegistry } from './tasks'

export const LAB_PORT = 7444

export interface LabServer {
  readonly port: number
  readonly url: string
  stop(): void
}

export interface StartLabArgs {
  readonly root: string
  readonly port?: number
  readonly open?: boolean
  /** Default: resolveRunner(project.config.engine). */
  readonly runner?: ClaudeRunner
  /** Default: packages/lab/dist. */
  readonly distDir?: string
}

const NOT_BUILT = `<!doctype html>
<html><head><meta charset="utf-8"><title>Sigil lab</title></head>
<body style="font-family: system-ui, sans-serif; padding: 2rem; max-width: 40rem">
<h1>The lab UI is not built</h1>
<p>Run <code>bun run --filter @sigil/lab build</code> and reload.</p>
<p>For development, run <code>bun run --filter @sigil/lab dev</code> and open <a href="http://localhost:7445">localhost:7445</a>; it proxies the API to this server.</p>
</body></html>
`

function isAddrInUse(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const code = 'code' in err ? err.code : undefined
  return code === 'EADDRINUSE' || /EADDRINUSE|in use/i.test(err.message)
}

/** A job still "running" when the lab starts died with the previous process; nothing can resume it. */
function markInterruptedJobs(sigilDir: string): void {
  for (const job of listJobs(sigilDir)) {
    if (job.status !== 'running') continue
    updateJob(sigilDir, job.id, { status: 'error', error: 'interrupted: the lab was stopped while this job was running', finishedAt: new Date().toISOString() })
  }
}

export function startLab(args: StartLabArgs): LabServer {
  const project = loadProject(args.root)
  const root = project.root
  const port = args.port ?? LAB_PORT
  const distDir = args.distDir ?? fileURLToPath(new URL('../dist', import.meta.url))
  const hasUi = existsSync(join(distDir, 'index.html'))
  const ctx = createContext({ root, runner: args.runner ?? resolveRunner(project.config.engine), tasks: createTaskRegistry() })
  markInterruptedJobs(project.sigilDir)

  const handle = (req: Request): Response | Promise<Response> => {
    const { pathname } = new URL(req.url)
    if (pathname === '/trpc' || pathname.startsWith('/trpc/')) {
      return fetchRequestHandler({ endpoint: '/trpc', req, router: appRouter, createContext: () => ctx })
    }
    if (pathname.startsWith('/files/')) {
      return serveSigilFile(ctx.project().sigilDir, pathname) ?? new Response('Not found', { status: 404 })
    }
    if (!hasUi && (pathname === '/' || pathname === '/index.html')) {
      return new Response(NOT_BUILT, { headers: { 'content-type': 'text/html; charset=utf-8' } })
    }
    return serveStatic(distDir, pathname) ?? new Response('Not found', { status: 404 })
  }

  let server: ReturnType<typeof Bun.serve>
  try {
    server = Bun.serve({ port, fetch: handle })
  } catch (err) {
    if (isAddrInUse(err)) throw new Error(`port ${port} is in use; pass --port`)
    throw err
  }

  const url = `http://localhost:${server.port ?? port}`
  console.log(`sigil lab → ${url}  (project ${root})`)
  if (args.open === true) openBrowser(url)

  return {
    port: server.port ?? port,
    url,
    stop: () => {
      void server.stop(true)
    },
  }
}

export { appRouter, createCaller, type AppRouter, type IconRow, type JobDetail, type JobRound } from './router'
export type { Task, TaskRegistry } from './tasks'
export { createContext, type LabContext } from './context'
