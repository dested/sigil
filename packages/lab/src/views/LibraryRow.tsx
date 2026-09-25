import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef, useState, type KeyboardEvent } from 'react'
import { Button } from '../components/Button'
import { Flag, groupFindings } from '../components/FlagChip'
import { IconCell } from '../components/IconCell'
import { useTRPC, type IconRowData, type StyleData } from '../trpc'

/** Tones for the row's cells: 24/20/16 inline, 44 tile, 20 on-dark — any of the last two may be absent. */
export interface CellPlan {
  readonly inline: string
  readonly tile: string | null
  readonly dark: string | null
}

export interface LibraryRowProps {
  readonly row: IconRowData
  readonly style: StyleData
  readonly cells: CellPlan
  readonly selected: boolean
  readonly onSelect: (name: string, on: boolean) => void
  /** A running job includes this icon. */
  readonly drawing: boolean
}

function BriefEditor({ row }: { readonly row: IconRowData }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(row.brief)
  const cancelled = useRef(false)
  const save = useMutation(
    trpc.project.setBrief.mutationOptions({ onSuccess: () => queryClient.invalidateQueries() }),
  )

  const commit = (): void => {
    setEditing(false)
    if (cancelled.current) {
      cancelled.current = false
      return
    }
    const next = draft.trim()
    if (next !== row.brief) save.mutate({ name: row.name, brief: next })
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') e.currentTarget.blur()
    if (e.key === 'Escape') {
      cancelled.current = true
      setDraft(row.brief)
      e.currentTarget.blur()
    }
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={onKey}
        className="h-8 w-full min-w-[200px] rounded-lg border border-border-2 bg-panel px-2 text-[13px] outline-none focus:border-ink"
      />
    )
  }
  const shown = save.isPending && save.variables !== undefined ? save.variables.brief : row.brief
  return (
    <button
      type="button"
      title="Click to edit"
      onClick={() => {
        setDraft(row.brief)
        setEditing(true)
      }}
      className={`w-full rounded-md px-1 py-0.5 text-left text-[13px] hover:bg-panel-2 ${shown === '' ? 'text-ink-3' : 'text-ink-2'}`}
    >
      {shown === '' ? 'Add a brief' : shown}
    </button>
  )
}

export function LibraryRow({ row, style, cells, selected, onSelect, drawing }: LibraryRowProps) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const invalidate = { onSuccess: () => queryClient.invalidateQueries() }
  const approve = useMutation(trpc.icons.approve.mutationOptions(invalidate))
  const draw = useMutation(trpc.icons.draw.mutationOptions(invalidate))
  const redraw = useMutation(
    trpc.icons.redraw.mutationOptions({
      onSuccess: () => {
        setNoteOpen(false)
        setNote('')
        return queryClient.invalidateQueries()
      },
    }),
  )
  const [noteOpen, setNoteOpen] = useState(false)
  const [zoom, setZoom] = useState(false)
  const [note, setNote] = useState('')

  const hasError = row.findings.some((f) => f.severity === 'error')
  const unresolved = row.cache?.status === 'unresolved'
  const edge = hasError ? 'border-l-error' : unresolved ? 'border-l-warn' : 'border-l-transparent'
  const approved = approve.isPending && approve.variables !== undefined ? approve.variables.approved : row.approved
  const td = 'px-3 py-3 align-top'

  return (
    <tr className="border-b border-border last:border-b-0">
      <td className={`${td} border-l-[3px] ${edge}`}>
        <input
          type="checkbox"
          aria-label={`Select ${row.name}`}
          checked={selected}
          onChange={(e) => onSelect(row.name, e.target.checked)}
          className="mt-1 size-4 accent-ink"
        />
      </td>
      <td className={`${td} mono whitespace-nowrap pt-3.5 text-ink`}>{row.name}</td>
      <td className={`${td} min-w-[220px] max-w-[320px] max-sm:hidden`}>
        <BriefEditor row={row} />
      </td>
      <td className={`${td} mono whitespace-nowrap pt-3.5 text-ink-2 max-sm:hidden`}>{row.group ?? '—'}</td>
      <td className={td}>
        <div className="flex items-end gap-2">
          <button
            type="button"
            aria-pressed={zoom}
            title={zoom ? 'Hide the 128 grid view' : 'Show the 128 grid view'}
            disabled={row.svg === null}
            onClick={() => setZoom((z) => !z)}
            className={`rounded-md ${zoom ? 'outline outline-1 outline-border-2' : ''} enabled:cursor-zoom-in`}
          >
            <IconCell bare svg={row.svg} style={style} tone={cells.inline} size={24} />
          </button>
          <IconCell bare svg={row.svg} style={style} tone={cells.inline} size={20} />
          <IconCell bare svg={row.svg} style={style} tone={cells.inline} size={16} />
          {cells.tile !== null ? <IconCell bare svg={row.svg} style={style} tone={cells.tile} size={44} /> : null}
          {cells.dark !== null ? <IconCell bare svg={row.svg} style={style} tone={cells.dark} size={20} /> : null}
          {zoom && row.svg !== null ? (
            <IconCell bare grid svg={row.svg} style={style} tone={cells.inline} size={128} />
          ) : null}
        </div>
      </td>
      <td className={`${td} min-w-[220px]`}>
        {row.findings.length === 0 ? (
          <span className="text-[13px] text-ink-3">{row.svg === null ? 'Not drawn' : 'Clean'}</span>
        ) : (
          <div className="flex flex-col gap-1.5">
            {groupFindings(row.findings).map((g) => (
              <Flag key={g.rule} severity={g.severity} rule={g.rule} message={g.message} count={g.count} />
            ))}
          </div>
        )}
        {unresolved ? <p className="mt-1.5 text-[13px] text-warn">Last job gave up before the checks passed</p> : null}
      </td>
      <td className={td}>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            {row.svg === null ? (
              <Button
                variant="primary"
                size="sm"
                busy={draw.isPending}
                disabled={drawing}
                onClick={() => draw.mutate({ names: [row.name] })}
              >
                {drawing ? 'Drawing' : 'Draw'}
              </Button>
            ) : (
              <>
                <button
                  type="button"
                  role="switch"
                  aria-checked={approved}
                  disabled={approve.isPending}
                  onClick={() => approve.mutate({ name: row.name, approved: !approved })}
                  className={`inline-flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-[12.5px] font-medium ${approved ? 'border-ok text-ok' : 'border-border text-ink hover:border-border-2'} bg-panel`}
                >
                  <span
                    aria-hidden="true"
                    className={`flex size-3.5 items-center justify-center rounded-[4px] border text-[10px] leading-none ${approved ? 'border-ok bg-ok text-white' : 'border-border-2'}`}
                  >
                    {approved ? '✓' : ''}
                  </span>
                  {approved ? 'Approved' : 'Approve'}
                </button>
                <Button variant="danger" size="sm" disabled={drawing} onClick={() => setNoteOpen((o) => !o)}>
                  {drawing ? 'Drawing' : 'Redraw'}
                </Button>
              </>
            )}
          </div>
          {noteOpen ? (
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                redraw.mutate({ name: row.name, note: note.trim() })
              }}
            >
              <input
                autoFocus
                value={note}
                placeholder="What should change"
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setNoteOpen(false)
                }}
                className="h-7 w-[220px] rounded-lg border border-border bg-panel px-2 text-[13px] outline-none focus:border-ink"
              />
              <Button type="submit" variant="primary" size="sm" busy={redraw.isPending}>
                Go
              </Button>
            </form>
          ) : null}
        </div>
      </td>
    </tr>
  )
}
