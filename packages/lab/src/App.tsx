import { useMutationState, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Banner } from './components/Banner'
import { ProgressBar } from './components/ProgressBar'
import { TopBar } from './components/TopBar'
import { useHashRoute } from './lib/useHashRoute'
import { errorMessage, useTRPC, type JobData, type TaskData } from './trpc'
import { DebugView } from './views/DebugView'
import { DirectionsView } from './views/DirectionsView'
import { JobsView } from './views/JobsView'
import { LibraryView } from './views/LibraryView'

const FAST = 1500
const SLOW = 10000

const anyRunning = (jobs: readonly JobData[] | undefined, tasks: readonly TaskData[] | undefined): boolean =>
  (jobs ?? []).some((j) => j.status === 'running') || (tasks ?? []).some((t) => t.status === 'running')

interface BannerState {
  readonly message: string
  readonly dismiss?: () => void
}

export function App() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()

  // Poll cadence reads the latest cached lists so jobs and tasks speed each other up.
  const interval = (): number =>
    anyRunning(queryClient.getQueryData(trpc.jobs.list.queryKey()), queryClient.getQueryData(trpc.tasks.list.queryKey()))
      ? FAST
      : SLOW
  const jobsQ = useQuery(trpc.jobs.list.queryOptions(undefined, { refetchInterval: interval }))
  const tasksQ = useQuery(trpc.tasks.list.queryOptions(undefined, { refetchInterval: interval }))
  const busy = anyRunning(jobsQ.data, tasksQ.data)

  const projectQ = useQuery(trpc.project.get.queryOptions(undefined, { refetchInterval: busy ? 3000 : false }))
  const cssQ = useQuery(trpc.project.css.queryOptions(undefined, { refetchInterval: busy ? 3000 : false }))

  // Work that finishes between polls changes icons, directions and css: refresh everything once on the way down.
  const wasBusy = useRef(busy)
  useEffect(() => {
    if (wasBusy.current && !busy) void queryClient.invalidateQueries()
    wasBusy.current = busy
  }, [busy, queryClient])

  const route = useHashRoute(projectQ.data?.hasStyle === true ? 'library' : 'directions')

  const [dismissedTask, setDismissedTask] = useState<string | null>(null)
  const mutationErrors = useMutationState({ filters: { status: 'error' }, select: (m) => m.state.error })
  const lastMutationError = mutationErrors.at(-1) ?? null
  const erroredTask = tasksQ.data?.find((t) => t.status === 'error')

  const banner = ((): BannerState | null => {
    for (const q of [projectQ, cssQ, jobsQ, tasksQ]) if (q.error !== null) return { message: errorMessage(q.error) }
    if (lastMutationError !== null) {
      return { message: errorMessage(lastMutationError), dismiss: () => queryClient.getMutationCache().clear() }
    }
    if (erroredTask !== undefined && erroredTask.id !== dismissedTask) {
      return {
        message: `${erroredTask.label} failed: ${erroredTask.error ?? 'unknown error'}`,
        dismiss: () => setDismissedTask(erroredTask.id),
      }
    }
    return null
  })()

  const cost = (jobsQ.data ?? []).reduce((sum, j) => sum + j.costUsd, 0)
  const project = projectQ.data

  return (
    <>
      {cssQ.data !== undefined && cssQ.data !== '' ? <style>{cssQ.data}</style> : null}
      <TopBar root={project?.root ?? null} route={route} costUsd={cost} />
      {busy ? <ProgressBar /> : null}
      <main className="mx-auto max-w-[1440px] px-6 pb-6 pt-[72px] max-sm:px-4">
        {banner !== null ? (
          <div className="mb-4">
            <Banner
              message={banner.message}
              onRetry={() => void queryClient.invalidateQueries()}
              {...(banner.dismiss !== undefined ? { onDismiss: banner.dismiss } : {})}
            />
          </div>
        ) : null}
        {project === undefined ? (
          projectQ.error === null ? <p className="text-ink-2">Loading project…</p> : null
        ) : route === 'directions' ? (
          <DirectionsView project={project} jobs={jobsQ.data ?? []} tasks={tasksQ.data ?? []} busy={busy} />
        ) : route === 'library' ? (
          <LibraryView project={project} jobs={jobsQ.data ?? []} />
        ) : route === 'jobs' ? (
          <JobsView jobs={jobsQ.data} />
        ) : (
          <DebugView jobs={jobsQ.data ?? []} />
        )}
      </main>
    </>
  )
}
