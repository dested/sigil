import { useCallback, useState } from 'react'
import { EmptyState } from '../components/EmptyState'
import { JobDrawer, StatusPill } from '../components/JobDrawer'
import { elapsed, money, timeAgo } from '../lib/format'
import { useNow } from '../lib/useNow'
import type { JobData } from '../trpc'

export function JobsView({ jobs }: { readonly jobs: readonly JobData[] | undefined }) {
  const [open, setOpen] = useState<string | null>(null)
  const now = useNow((jobs ?? []).some((j) => j.status === 'running'))
  const close = useCallback(() => setOpen(null), [])

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-[20px] font-semibold">Jobs</h1>
      {jobs === undefined ? (
        <p className="text-ink-2">Loading jobs…</p>
      ) : jobs.length === 0 ? (
        <EmptyState message="No jobs yet. Drawing icons or generating directions starts one." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-panel">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-border text-[12.5px] text-ink-3">
                <th className="px-4 py-2 font-normal">id</th>
                <th className="px-4 py-2 font-normal">icons</th>
                <th className="px-4 py-2 font-normal">status</th>
                <th className="px-4 py-2 font-normal">round</th>
                <th className="px-4 py-2 font-normal">cost</th>
                <th className="px-4 py-2 font-normal max-sm:hidden">started</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr
                  key={j.id}
                  tabIndex={0}
                  onClick={() => setOpen(j.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setOpen(j.id)
                  }}
                  className={`cursor-pointer border-b border-border last:border-b-0 hover:bg-panel-2 ${open === j.id ? 'bg-panel-2' : ''}`}
                >
                  <td className="mono whitespace-nowrap px-4 py-2.5 text-ink">{j.id}</td>
                  <td className="mono max-w-[40ch] truncate px-4 py-2.5 text-ink-2">
                    {j.kind !== 'draw' ? `${j.kind} · ` : ''}
                    {j.names.join(', ')}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusPill status={j.status} />
                  </td>
                  <td className="mono whitespace-nowrap px-4 py-2.5 text-ink-2">
                    {j.round} / {j.maxRounds}
                  </td>
                  <td className="mono px-4 py-2.5 text-ink-2">{money(j.costUsd)}</td>
                  <td className="mono whitespace-nowrap px-4 py-2.5 text-ink-3 max-sm:hidden">
                    {timeAgo(j.startedAt)} · {j.status === 'running' ? elapsed(j.startedAt, undefined, now) : elapsed(j.startedAt, j.finishedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open !== null ? <JobDrawer id={open} onClose={close} /> : null}
    </div>
  )
}
