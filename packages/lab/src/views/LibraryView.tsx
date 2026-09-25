import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '../components/Button'
import { EmptyState } from '../components/EmptyState'
import { darkTone, firstInlineTone, firstTileTone } from '../lib/glyph'
import { goTo } from '../lib/useHashRoute'
import { useTRPC, type JobData, type ProjectData } from '../trpc'
import { LibraryRow, type CellPlan } from './LibraryRow'

export interface LibraryViewProps {
  readonly project: ProjectData
  readonly jobs: readonly JobData[]
}

export function LibraryView({ project, jobs }: LibraryViewProps) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set())
  const [builtFiles, setBuiltFiles] = useState<number | null>(null)

  const invalidate = { onSuccess: () => queryClient.invalidateQueries() }
  const draw = useMutation(
    trpc.icons.draw.mutationOptions({
      onSuccess: () => {
        setSelected(new Set())
        return queryClient.invalidateQueries()
      },
    }),
  )
  const drawAll = useMutation(trpc.icons.draw.mutationOptions(invalidate))
  const build = useMutation(
    trpc.build.run.mutationOptions({
      onSuccess: (res) => {
        setBuiltFiles(res.files.length)
        return queryClient.invalidateQueries()
      },
    }),
  )

  useEffect(() => {
    if (builtFiles === null) return
    const t = window.setTimeout(() => setBuiltFiles(null), 5000)
    return () => window.clearTimeout(t)
  }, [builtFiles])

  const drawingNames = useMemo(() => {
    const s = new Set<string>()
    for (const j of jobs) if (j.status === 'running' && j.kind === 'draw') for (const n of j.names) s.add(n)
    return s
  }, [jobs])

  const runningJobs = jobs.filter((j) => j.status === 'running').length
  const style = project.style
  const rows = project.icons
  const cells = useMemo((): CellPlan | null => {
    if (style === null) return null
    return { inline: firstInlineTone(style), tile: firstTileTone(style), dark: darkTone(style) }
  }, [style])

  // Keep the selection honest when rows disappear from the manifest.
  const names = rows.map((r) => r.name)
  const liveSelection = names.filter((n) => selected.has(n))

  const title = <h1 className="text-[20px] font-semibold">Library</h1>

  if (style === null || cells === null) {
    return (
      <div className="flex flex-col gap-4">
        {title}
        <EmptyState message="No style yet. Pick a direction to write icon.md, then draw here.">
          <Button variant="primary" onClick={() => goTo('directions')}>
            Go to Directions
          </Button>
        </EmptyState>
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {title}
        <EmptyState message="No icons in the manifest yet. Add names and briefs to icons/manifest.json." />
      </div>
    )
  }

  if (rows.every((r) => r.svg === null)) {
    return (
      <div className="flex flex-col gap-4">
        {title}
        <EmptyState message="No icons drawn yet.">
          <Button
            variant="primary"
            busy={drawAll.isPending}
            disabled={drawingNames.size > 0}
            onClick={() => drawAll.mutate({ names })}
          >
            {drawingNames.size > 0 ? 'Drawing' : 'Draw all'}
          </Button>
        </EmptyState>
      </div>
    )
  }

  const toggle = (name: string, on: boolean): void => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (on) next.add(name)
      else next.delete(name)
      return next
    })
  }
  const allOn = liveSelection.length === rows.length

  return (
    <div className="flex flex-col gap-4 pb-20">
      <div className="flex items-baseline gap-3">
        {title}
        <span className="mono text-ink-3">
          {rows.filter((r) => r.svg !== null).length} / {rows.length} drawn · {rows.filter((r) => r.approved).length} approved
        </span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border bg-panel">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-border text-[12.5px] text-ink-3">
              <th className="border-l-[3px] border-l-transparent px-3 py-2 font-normal">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={allOn}
                  onChange={(e) => setSelected(e.target.checked ? new Set(names) : new Set())}
                  className="size-4 accent-ink"
                />
              </th>
              <th className="px-3 py-2 font-normal">name</th>
              <th className="px-3 py-2 font-normal max-sm:hidden">brief</th>
              <th className="px-3 py-2 font-normal max-sm:hidden">group</th>
              <th className="px-3 py-2 font-normal">cells</th>
              <th className="px-3 py-2 font-normal">flags</th>
              <th className="px-3 py-2 font-normal">
                <span className="sr-only">actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <LibraryRow
                key={row.name}
                row={row}
                style={style}
                cells={cells}
                selected={selected.has(row.name)}
                onSelect={toggle}
                drawing={drawingNames.has(row.name)}
              />
            ))}
          </tbody>
        </table>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-30 h-14 border-t border-border bg-panel">
        <div className="mx-auto flex h-full max-w-[1440px] items-center gap-3 px-6 max-sm:px-4">
          <Button
            variant="primary"
            busy={draw.isPending}
            disabled={liveSelection.length === 0}
            onClick={() => draw.mutate({ names: liveSelection })}
          >
            Draw selected ({liveSelection.length})
          </Button>
          <Button busy={build.isPending} onClick={() => build.mutate()}>
            Build
          </Button>
          {builtFiles !== null ? <span className="mono text-ok">{builtFiles} files</span> : null}
          {runningJobs > 0 ? (
            <a
              href="#jobs"
              onClick={(e) => {
                e.preventDefault()
                goTo('jobs')
              }}
              className="mono ml-auto whitespace-nowrap text-ink-2 hover:text-ink"
            >
              {runningJobs} running · <span className="underline underline-offset-2">Jobs</span>
            </a>
          ) : null}
        </div>
      </div>
    </div>
  )
}
