import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Banner } from '../components/Banner'
import { Button } from '../components/Button'
import { EmptyState } from '../components/EmptyState'
import { goTo } from '../lib/useHashRoute'
import { errorMessage, useTRPC, type DirectionData, type JobData, type ProjectData, type TaskData } from '../trpc'
import { DirectionColumn } from './DirectionColumn'
import { GenerateForm } from './GenerateForm'
import { MixBar } from './MixBar'

export interface DirectionsViewProps {
  readonly project: ProjectData
  readonly jobs: readonly JobData[]
  readonly tasks: readonly TaskData[]
  readonly busy: boolean
}

const running = (t: TaskData, prefix: string): boolean => t.status === 'running' && t.label.startsWith(prefix)

function Placeholder({ label }: { readonly label: string }) {
  return (
    <div className="flex w-[360px] shrink-0 flex-col gap-2 rounded-xl border border-dashed border-border-2 bg-panel p-3">
      <h2 className="text-[15px] font-semibold text-ink-2">{label}</h2>
      <p className="text-[13px] text-ink-2">Generating…</p>
    </div>
  )
}

export function DirectionsView({ project, jobs, tasks, busy }: DirectionsViewProps) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const list = useQuery(trpc.directions.list.queryOptions(undefined, { refetchInterval: busy ? 5000 : false }))
  const [picking, setPicking] = useState<DirectionData | null>(null)
  const pick = useMutation(
    trpc.directions.pick.mutationOptions({
      onSuccess: async () => {
        setPicking(null)
        await queryClient.invalidateQueries()
        goTo('library')
      },
    }),
  )

  const generating = tasks.some((t) => running(t, 'directions '))
  const mixing = tasks.some((t) => running(t, 'mix '))
  const drawingFor = (id: string): boolean => jobs.some((j) => j.status === 'running' && j.directionId === id)
  const samplesJobFor = (id: string): JobData | null =>
    jobs.find((j) => j.status === 'running' && j.kind === 'samples' && j.directionId === id) ?? null
  const queued = generating || mixing || jobs.some((j) => j.status === 'running' && j.kind === 'samples')
  const revisingFor = (id: string): boolean => tasks.some((t) => t.status === 'running' && t.label === `iterate ${id}`)
  const anyRevising = tasks.some((t) => running(t, 'iterate '))

  const title = <h1 className="text-[20px] font-semibold">Directions</h1>
  const directions = list.data

  if (directions === undefined) {
    return (
      <div className="flex flex-col gap-4">
        {title}
        {list.error !== null ? (
          <Banner message={errorMessage(list.error)} onRetry={() => void list.refetch()} />
        ) : (
          <p className="text-ink-2">Loading directions…</p>
        )}
      </div>
    )
  }

  if (directions.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {title}
        {generating ? (
          <div className="flex gap-4 overflow-x-auto pb-2">
            {['A', 'B', 'C', 'D', 'E'].map((l) => (
              <Placeholder key={l} label={l} />
            ))}
          </div>
        ) : (
          <EmptyState message="No directions yet. Pick the nav items to sample and generate five.">
            <GenerateForm root={project.root} manifest={project.manifest} running={generating} />
          </EmptyState>
        )}
      </div>
    )
  }

  return (
    <div className={`flex flex-col gap-4 ${picking !== null ? 'pb-20' : ''}`}>
      <div className="flex items-baseline gap-3">
        {title}
        <span className="mono text-ink-3">{directions.length} drafts</span>
      </div>
      {list.error !== null ? <Banner message={errorMessage(list.error)} onRetry={() => void list.refetch()} /> : null}
      <MixBar directions={directions} running={mixing} />
      <div className="-mx-6 flex gap-4 overflow-x-auto px-6 pb-2 max-sm:-mx-4 max-sm:px-4">
        {directions.map((d) => (
          <DirectionColumn
            key={d.id}
            direction={d}
            drawing={drawingFor(d.id)}
            samplesJob={samplesJobFor(d.id)}
            queued={queued}
            revising={revisingFor(d.id)}
            picking={picking?.id === d.id}
            onPick={setPicking}
          />
        ))}
        {mixing ? <Placeholder label="Mix" /> : null}
        {anyRevising ? <Placeholder label="Revision" /> : null}
        {generating ? <Placeholder label="New drafts" /> : null}
      </div>
      {picking !== null ? (
        <div className="fixed inset-x-0 bottom-0 z-30 h-14 border-t border-border bg-panel">
          <div className="mx-auto flex h-full max-w-[1440px] items-center gap-3 px-6 max-sm:px-4">
            <p className="min-w-0 flex-1 truncate text-[13px] text-ink-2">
              Picking writes icon.md and the sample icons into the project, then builds.
            </p>
            <Button onClick={() => setPicking(null)} disabled={pick.isPending}>
              Cancel
            </Button>
            <Button variant="primary" busy={pick.isPending} onClick={() => pick.mutate({ id: picking.id })}>
              Pick {picking.letter} · {picking.name}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
