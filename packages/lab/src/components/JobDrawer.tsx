import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { elapsed, money } from '../lib/format'
import { errorMessage, useTRPC, type JobData, type JobDetailData } from '../trpc'
import { Banner } from './Banner'
import { Flag } from './FlagChip'

const PILL: Record<JobData['status'], string> = {
  running: 'border-ink text-ink',
  done: 'border-ok text-ok',
  unresolved: 'border-warn text-warn',
  error: 'border-error text-error',
}

export function StatusPill({ status }: { readonly status: JobData['status'] }) {
  return <span className={`mono inline-flex h-5 items-center rounded-lg border px-2 ${PILL[status]}`}>{status}</span>
}

function logLine(e: JobDetailData['log'][number]): string {
  const time = e.at.slice(11, 19)
  switch (e.type) {
    case 'round':
      return `${time}  round ${e.round}${e.icon !== undefined ? `  ${e.icon}` : ''}  ${e.message}`
    case 'done':
      return `${time}  done`
    case 'error':
      return `${time}  error  ${e.message}`
    case 'note':
      return `${time}  note${e.round !== undefined ? ` r${e.round}` : ''}  ${e.message}`
  }
}

function Rounds({ job }: { readonly job: JobDetailData }) {
  if (job.rounds.length === 0) {
    return <p className="text-ink-2">{job.status === 'running' ? 'Drawing the first round…' : 'No rounds recorded'}</p>
  }
  const rounds = [...job.rounds].reverse()
  return (
    <div className="flex flex-col gap-8">
      {rounds.map((r) => (
        <section key={r.round} className="flex flex-col gap-3">
          <h2 className="text-[15px] font-semibold">Round {r.round}</h2>
          <div className="overflow-x-auto rounded-lg border border-border bg-panel-2">
            <img src={r.png} alt={`Round ${r.round} sheet`} className="block max-w-none" />
          </div>
          {r.findings.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              {r.findings.map((f, i) => (
                <Flag key={`${f.icon}-${f.rule}-${i}`} severity={f.severity} rule={f.rule} message={`${f.icon}: ${f.message}`} />
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-ok">No findings</p>
          )}
          {Object.keys(r.critiques).length > 0 ? (
            <dl className="flex flex-col gap-2">
              {Object.entries(r.critiques).map(([name, text]) => (
                <div key={name} className="flex flex-col gap-0.5">
                  <dt className="mono text-ink">{name}</dt>
                  <dd className="text-[13px] text-ink-2">{text}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </section>
      ))}
    </div>
  )
}

export interface JobDrawerProps {
  readonly id: string
  readonly onClose: () => void
}

export function JobDrawer({ id, onClose }: JobDrawerProps) {
  const trpc = useTRPC()
  const [tab, setTab] = useState<'rounds' | 'log'>('rounds')
  const q = useQuery(
    trpc.jobs.get.queryOptions(
      { id },
      { refetchInterval: (query) => (query.state.data?.status === 'running' ? 1500 : false) },
    ),
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const job = q.data
  return (
    <div
      role="dialog"
      aria-label={`Job ${id}`}
      className="fixed inset-x-0 bottom-0 z-50 flex h-[60vh] flex-col border-t border-border bg-panel max-sm:top-0 max-sm:h-auto"
    >
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-6 py-3 max-sm:px-4">
        <span className="mono text-ink">{id}</span>
        {job !== undefined ? (
          <>
            <span className="mono min-w-0 max-w-[40ch] truncate text-ink-2">{job.names.join(', ')}</span>
            <StatusPill status={job.status} />
            <span className="mono text-ink-2">
              {job.round} / {job.maxRounds}
            </span>
            <span className="mono text-ink-2">{money(job.costUsd)}</span>
            <span className="mono text-ink-3">{elapsed(job.startedAt, job.finishedAt)}</span>
          </>
        ) : null}
        <div className="ml-auto flex items-center gap-1">
          {(['rounds', 'log'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`h-7 rounded-lg px-2.5 text-[13px] ${tab === t ? 'bg-panel-2 font-semibold text-ink' : 'text-ink-2 hover:text-ink'}`}
            >
              {t === 'rounds' ? 'Rounds' : 'Log'}
            </button>
          ))}
          <button type="button" aria-label="Close" onClick={onClose} className="ml-2 px-1 text-xl leading-none text-ink-3 hover:text-ink">
            ×
          </button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 max-sm:px-4">
        {q.error !== null ? (
          <Banner message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
        ) : job === undefined ? (
          <p className="text-ink-2">Loading job…</p>
        ) : (
          <div className="flex flex-col gap-5">
            {job.error !== undefined ? <Banner message={job.error} /> : null}
            {tab === 'rounds' ? (
              <Rounds job={job} />
            ) : job.log.length === 0 ? (
              <p className="text-ink-2">No log lines yet</p>
            ) : (
              <pre className="mono whitespace-pre-wrap break-words text-ink-2">{job.log.map(logLine).join('\n')}</pre>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
