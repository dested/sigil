import { useQuery } from '@tanstack/react-query'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Banner } from '../components/Banner'
import { Button } from '../components/Button'
import { StatusPill } from '../components/JobDrawer'
import { bytes, clock, elapsed, money, timeAgo } from '../lib/format'
import { useNow } from '../lib/useNow'
import { errorMessage, useTRPC, type FeedData, type FeedLineData, type JobData } from '../trpc'

function lineTone(l: FeedLineData): string {
  if (l.type === 'error') return 'text-error'
  if (l.type === 'done') return 'text-ok'
  if (l.type === 'note' && l.message.startsWith('claude:')) return 'text-ink-3'
  return 'text-ink'
}

function FeedPanel({ feed }: { readonly feed: FeedData }) {
  const box = useRef<HTMLDivElement>(null)
  // Follow the tail until the user scrolls up; scrolling back to the bottom re-arms it.
  const stick = useRef(true)
  const last = feed.lines.at(-1)
  const tailKey = `${feed.lines.length}:${last?.at ?? ''}`

  useLayoutEffect(() => {
    const el = box.current
    if (el !== null && stick.current) el.scrollTop = el.scrollHeight
  }, [tailKey])

  return (
    <div
      ref={box}
      onScroll={(e) => {
        const el = e.currentTarget
        stick.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 8
      }}
      className="mono max-h-[70vh] overflow-y-auto rounded-xl border border-border bg-panel px-4 py-3 leading-[1.6]"
    >
      {feed.lines.length === 0 ? (
        <p className="text-ink-2">No log lines yet</p>
      ) : (
        feed.lines.map((l, i) => (
          <div key={`${l.at}-${l.jobId}-${i}`} className={`whitespace-pre-wrap break-words ${lineTone(l)}`}>
            {`${clock(l.at)}  ${l.jobId.slice(-4)}  ${l.kind.padEnd(10)}  ${l.message}`}
          </div>
        ))
      )}
    </div>
  )
}

function JobFiles({ id }: { readonly id: string }) {
  const trpc = useTRPC()
  const q = useQuery(trpc.jobs.get.queryOptions({ id }))
  if (q.error !== null) return <p className="text-[13px] text-error">{errorMessage(q.error)}</p>
  if (q.data === undefined) return <p className="text-[13px] text-ink-2">Loading files…</p>
  if (q.data.files.length === 0) return <p className="text-[13px] text-ink-2">No files</p>
  return (
    <ul className="flex flex-col gap-0.5">
      {q.data.files.map((f) => (
        <li key={f.name} className="mono flex gap-3">
          <a href={f.url} target="_blank" rel="noreferrer" className="text-ink underline underline-offset-2 hover:text-ink-2">
            {f.name}
          </a>
          <span className="text-ink-3">{bytes(f.bytes)}</span>
        </li>
      ))}
    </ul>
  )
}

function JobList({ jobs }: { readonly jobs: readonly JobData[] }) {
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set())
  const toggle = (id: string): void =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  if (jobs.length === 0) return <p className="text-ink-2">No jobs yet</p>
  return (
    <div className="rounded-xl border border-border bg-panel">
      {jobs.slice(0, 20).map((j) => (
        <div key={j.id} className="border-b border-border px-4 py-2.5 last:border-b-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <button
              type="button"
              aria-expanded={open.has(j.id)}
              onClick={() => toggle(j.id)}
              className="mono w-4 text-ink-3 hover:text-ink"
              aria-label={`${open.has(j.id) ? 'Hide' : 'Show'} files for ${j.id}`}
            >
              {open.has(j.id) ? '▾' : '▸'}
            </button>
            <span className="mono text-ink">{j.id}</span>
            <span className="mono text-ink-2">{j.kind}</span>
            <StatusPill status={j.status} />
            <span className="mono min-w-0 max-w-[40ch] truncate text-ink-2">{j.names.join(', ')}</span>
            <span className="mono ml-auto text-ink-3">
              {money(j.costUsd)} · {timeAgo(j.startedAt)}
            </span>
          </div>
          {open.has(j.id) ? (
            <div className="mt-2 pl-7">
              <JobFiles id={j.id} />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  )
}

export function DebugView({ jobs }: { readonly jobs: readonly JobData[] }) {
  const trpc = useTRPC()
  const [paused, setPaused] = useState(false)
  const feed = useQuery(
    trpc.debug.feed.queryOptions(
      { limit: 500 },
      { refetchInterval: (q) => (paused ? false : (q.state.data?.running.length ?? 0) > 0 ? 1000 : 5000) },
    ),
  )
  const running = feed.data?.running ?? []
  const now = useNow(running.length > 0)

  // Pausing freezes the view; resuming refreshes at once instead of waiting a full interval.
  const refetchFeed = feed.refetch
  const wasPaused = useRef(paused)
  useEffect(() => {
    if (wasPaused.current && !paused) void refetchFeed()
    wasPaused.current = paused
  }, [paused, refetchFeed])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <h1 className="text-[20px] font-semibold">Debug</h1>
        <Button size="sm" className="ml-auto" aria-pressed={paused} onClick={() => setPaused((p) => !p)}>
          {paused ? 'Resume' : 'Pause'}
        </Button>
      </div>

      {feed.error !== null ? <Banner message={errorMessage(feed.error)} onRetry={() => void feed.refetch()} /> : null}

      <section className="flex flex-col gap-2">
        <h2 className="text-[15px] font-semibold">Running</h2>
        {running.length === 0 ? (
          <p className="text-ink-2">nothing running</p>
        ) : (
          <div className="rounded-xl border border-border bg-panel">
            {running.map((r) => (
              <div key={r.jobId} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-4 py-2.5 last:border-b-0">
                <span className="mono text-ink-2">{r.kind}</span>
                <span className="mono min-w-0 max-w-[48ch] truncate text-ink">{r.names.length > 0 ? r.names.join(', ') : r.jobId}</span>
                <span className="mono text-ink-2">
                  round {r.round} / {r.maxRounds}
                </span>
                <span className="mono ml-auto text-ink">{elapsed(r.startedAt, undefined, now)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-[15px] font-semibold">Feed</h2>
        {feed.data === undefined ? <p className="text-ink-2">Loading feed…</p> : <FeedPanel feed={feed.data} />}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-[15px] font-semibold">Jobs</h2>
        <JobList jobs={jobs} />
      </section>
    </div>
  )
}
