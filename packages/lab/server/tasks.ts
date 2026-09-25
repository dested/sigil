export type TaskStatus = 'running' | 'done' | 'error'

export interface Task {
  readonly id: string
  readonly label: string
  readonly status: TaskStatus
  readonly error?: string
  readonly startedAt: string
  readonly finishedAt?: string
}

export interface TaskRegistry {
  start(label: string, fn: () => Promise<unknown>): Task
  /** Newest first. */
  list(): Task[]
  running(): number
  /** Resolves once no task is running, including tasks started while waiting. */
  wait(): Promise<void>
}

const KEEP = 200
const now = (): string => new Date().toISOString()
const errMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err))

export function createTaskRegistry(): TaskRegistry {
  let counter = 0
  const tasks: Task[] = []
  const inflight = new Set<Promise<void>>()

  const replace = (id: string, next: Task): void => {
    const i = tasks.findIndex((t) => t.id === id)
    if (i >= 0) tasks[i] = next
  }

  return {
    start(label, fn) {
      counter += 1
      const task: Task = { id: `${Date.now()}-${counter}`, label, status: 'running', startedAt: now() }
      tasks.push(task)
      if (tasks.length > KEEP) tasks.splice(0, tasks.length - KEEP)
      let pending: Promise<unknown>
      try {
        pending = fn()
      } catch (err) {
        pending = Promise.reject(err)
      }
      const settled = pending.then(
        () => replace(task.id, { ...task, status: 'done', finishedAt: now() }),
        (err: unknown) => replace(task.id, { ...task, status: 'error', error: errMessage(err), finishedAt: now() }),
      )
      inflight.add(settled)
      void settled.finally(() => inflight.delete(settled))
      return task
    },
    list() {
      return [...tasks].reverse()
    },
    running() {
      return inflight.size
    },
    async wait() {
      while (inflight.size > 0) await Promise.all([...inflight])
    },
  }
}
