import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '../components/Button'
import { useTRPC, type DirectionData } from '../trpc'

const FACETS = ['line', 'tone', 'radius', 'prose'] as const
type Facet = (typeof FACETS)[number]
type Sources = Readonly<Record<Facet, string>>

export interface MixBarProps {
  readonly directions: readonly DirectionData[]
  readonly running: boolean
}

export function MixBar({ directions, running }: MixBarProps) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const first = directions[0]?.id ?? ''
  const [sources, setSources] = useState<Sources>({ line: first, tone: first, radius: first, prose: first })
  const mix = useMutation(trpc.directions.mix.mutationOptions({ onSuccess: () => queryClient.invalidateQueries() }))

  // A direction may vanish between polls; fall back to the first rather than sending a dead id.
  const ids = new Set(directions.map((d) => d.id))
  const valid = (id: string): string => (ids.has(id) ? id : first)
  const current: Sources = {
    line: valid(sources.line),
    tone: valid(sources.tone),
    radius: valid(sources.radius),
    prose: valid(sources.prose),
  }
  const same = FACETS.every((f) => current[f] === current.line)

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-2 rounded-xl border border-border bg-panel px-4 py-3">
      {FACETS.map((facet, i) => (
        <span key={facet} className="flex items-center gap-1.5">
          {i > 0 ? <span className="text-ink-3">·</span> : null}
          <span className="text-ink-2">{facet} from</span>
          <select
            aria-label={`${facet} from`}
            value={current[facet]}
            onChange={(e) => setSources((prev) => ({ ...prev, [facet]: e.target.value }))}
            className="mono h-7 rounded-lg border border-border bg-panel px-1.5 text-ink outline-none focus:border-ink"
          >
            {directions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.letter}
              </option>
            ))}
          </select>
        </span>
      ))}
      <Button
        variant="secondary"
        className="ml-auto"
        busy={mix.isPending}
        disabled={running || same || first === ''}
        title={same ? 'Choose at least two different directions' : undefined}
        onClick={() => mix.mutate(current)}
      >
        Mix
      </Button>
    </div>
  )
}
