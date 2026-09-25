import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef, useState, type ReactNode } from 'react'
import { Button } from '../components/Button'
import { ContextStrips } from '../components/ContextStrips'
import { elapsed, titleCase } from '../lib/format'
import { useNow } from '../lib/useNow'
import { isTile, tileBackground } from '../lib/glyph'
import { useTRPC, type DirectionData, type JobData } from '../trpc'

/** First sentence of the `## Voice` section of an icon.md body. */
export function voiceLine(body: string): string {
  const section = /^##\s+Voice\s*$([\s\S]*?)(?=^##\s|(?![\s\S]))/m.exec(body)?.[1]?.trim() ?? ''
  if (section === '') return ''
  const flat = section.replace(/\s+/g, ' ')
  return /^.*?[.!?](?=\s|$)/.exec(flat)?.[0] ?? flat
}

function Swatch({ background, title }: { readonly background: string; readonly title: string }) {
  return <span title={title} className="inline-block size-3.5 rounded-[3px] border border-border" style={{ background }} />
}

function Facet({ name, children }: { readonly name: string; readonly children: ReactNode }) {
  return (
    <tr className="border-t border-border first:border-t-0">
      <th scope="row" className="mono w-[64px] py-1.5 pr-3 text-left align-top font-normal text-ink-3">
        {name}
      </th>
      <td className="py-1.5 text-[13px] text-ink">{children}</td>
    </tr>
  )
}

export interface DirectionColumnProps {
  readonly direction: DirectionData
  /** Any running job for this direction (samples or iterate). */
  readonly drawing: boolean
  /** The running samples job for this direction, for the round readout. */
  readonly samplesJob: JobData | null
  /** A directions/mix task or some samples job is running, so empty samples are pending rather than missing. */
  readonly queued: boolean
  /** An iterate task for this direction is running. */
  readonly revising: boolean
  readonly onPick: (d: DirectionData) => void
  readonly picking: boolean
}

export function DirectionColumn({ direction: d, drawing, samplesJob, queued, revising, onPick, picking }: DirectionColumnProps) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const now = useNow(samplesJob !== null)
  const [note, setNote] = useState('')
  const area = useRef<HTMLTextAreaElement>(null)
  const drawSamples = useMutation(
    trpc.directions.drawSamples.mutationOptions({ onSuccess: () => queryClient.invalidateQueries() }),
  )
  const iterate = useMutation(
    trpc.directions.iterate.mutationOptions({
      onSuccess: () => {
        setNote('')
        if (area.current !== null) area.current.style.height = ''
        return queryClient.invalidateQueries()
      },
    }),
  )

  const style = d.style
  const samples = d.samples.map((s) => ({ name: s.name, svg: s.svg, label: titleCase(s.name) }))
  const busy = drawing || revising
  const prose = voiceLine(style.body)

  return (
    <div className={`dir-${d.id} flex w-[360px] shrink-0 flex-col gap-4 rounded-xl border bg-panel p-3 ${picking ? 'border-ink' : 'border-border'}`}>
      <style>{d.css}</style>
      <div className="flex flex-col gap-0.5">
        <h2 className="text-[15px] font-semibold">
          {d.letter} · {d.name}
        </h2>
        {d.parent !== undefined || d.note !== undefined ? (
          <p className="mono text-ink-3">
            {d.parent !== undefined ? `from ${d.parent}` : ''}
            {d.parent !== undefined && d.note !== undefined ? ' · ' : ''}
            {d.note ?? ''}
          </p>
        ) : null}
      </div>

      {samplesJob !== null ? (
        <p className="text-[13px] text-ink-2">
          Drawing samples · round <span className="mono">{samplesJob.round} / {samplesJob.maxRounds}</span> ·{' '}
          <span className="mono">{elapsed(samplesJob.startedAt, undefined, now)}</span>
        </p>
      ) : drawing ? (
        <p className="text-[13px] text-ink-2">Generating…</p>
      ) : samples.length === 0 && queued ? (
        <p className="text-[13px] text-ink-2">Queued…</p>
      ) : null}
      {samples.length > 0 || (!drawing && !queued) ? <ContextStrips style={style} samples={samples} /> : null}

      <table className="w-full border-collapse">
        <tbody>
          <Facet name="line">
            <span className="mono">
              {style.stroke} {style.caps}
            </span>
          </Facet>
          <Facet name="tone">
            <span className="flex flex-wrap gap-x-3 gap-y-1.5">
              {Object.entries(style.tones).map(([name, tone]) => (
                <span key={name} className="flex items-center gap-1" title={name}>
                  {isTile(tone) && tone.bg !== undefined ? (
                    <Swatch background={tileBackground(tone.bg)} title={`${name} bg`} />
                  ) : (
                    <>
                      <Swatch background={tone.line} title={`${name} line`} />
                      <Swatch background={tone.plane} title={`${name} plane`} />
                    </>
                  )}
                  <span className="mono text-ink-3">{name}</span>
                </span>
              ))}
            </span>
          </Facet>
          <Facet name="radius">
            <span className="mono">{Object.values(style.radius).join(' / ')}</span>
          </Facet>
          <Facet name="prose">
            <span className="text-ink-2">{prose === '' ? '—' : prose}</span>
          </Facet>
        </tbody>
      </table>

      <form
        className="mt-auto flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          const n = note.trim()
          if (n !== '') iterate.mutate({ id: d.id, note: n })
        }}
      >
        <textarea
          ref={area}
          rows={1}
          value={note}
          aria-label={`Iterate ${d.letter}`}
          placeholder="Iterate: heavier planes, softer corners…"
          onChange={(e) => {
            setNote(e.target.value)
            e.target.style.height = 'auto'
            e.target.style.height = `${e.target.scrollHeight}px`
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit()
          }}
          className="resize-none overflow-hidden rounded-lg border border-border bg-panel px-2.5 py-1.5 text-[13px] outline-none focus:border-ink"
        />
        <div className="flex items-center gap-2">
          <Button type="submit" busy={iterate.isPending} disabled={busy || note.trim() === ''}>
            {revising ? 'Revising' : 'Revise'}
          </Button>
          <Button busy={drawSamples.isPending} disabled={busy} onClick={() => drawSamples.mutate({ id: d.id })}>
            {d.samples.length === 0 ? 'Draw samples' : 'Redraw samples'}
          </Button>
          <Button variant="primary" className="ml-auto" disabled={busy} onClick={() => onPick(d)}>
            Pick
          </Button>
        </div>
      </form>
    </div>
  )
}
