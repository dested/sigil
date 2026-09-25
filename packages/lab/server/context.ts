import type { ClaudeRunner, IconStyle, Project } from '@sigil/core'
import { loadProject } from '@sigil/core'
import { TRPCError } from '@trpc/server'
import type { TaskRegistry } from './tasks'

export interface LabContext {
  readonly root: string
  readonly runner: ClaudeRunner
  readonly tasks: TaskRegistry
  /** Fresh from disk on every call; the lab never holds project state in memory. */
  project(): Project
}

export function createContext(args: { root: string; runner: ClaudeRunner; tasks: TaskRegistry }): LabContext {
  return {
    root: args.root,
    runner: args.runner,
    tasks: args.tasks,
    project: () => loadProject(args.root),
  }
}

export function requireStyle(ctx: LabContext): { project: Project; style: IconStyle } {
  const project = ctx.project()
  if (project.style === null) {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'icon.md missing or invalid' })
  }
  return { project, style: project.style }
}
