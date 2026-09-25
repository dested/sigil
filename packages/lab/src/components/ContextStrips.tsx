import type { ReactNode } from 'react'
import { darkTone, firstInlineTone, firstTileTone, type ToneSource } from '../lib/glyph'
import { Glyph } from './IconCell'

export interface StripSample {
  readonly name: string
  readonly svg: string
  readonly label: string
}

export interface ContextStripsProps {
  readonly style: ToneSource
  readonly samples: readonly StripSample[]
}

function Strip({ name, children }: { readonly name: string; readonly children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="mono w-[84px] shrink-0 text-ink-3">{name}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

/** The four in-situ previews from ui.md, in fixed order; strips without a matching tone are skipped. */
export function ContextStrips({ style, samples }: ContextStripsProps) {
  const three = samples.slice(0, 3)
  const tile = firstTileTone(style)
  const inline = firstInlineTone(style)
  const dark = darkTone(style)
  if (three.length === 0) return <p className="text-[13px] text-ink-3">No sample icons</p>
  return (
    <div className="flex flex-col gap-3">
      {tile !== null ? (
        <Strip name="grid tile">
          <div className="flex gap-3">
            {three.map((s) => (
              <div key={s.name} className="flex w-[64px] flex-col items-center gap-1">
                <Glyph svg={s.svg} style={style} tone={tile} size={44} />
                <span className="w-full truncate text-center text-[11px] leading-tight text-ink-2">{s.label}</span>
              </div>
            ))}
          </div>
        </Strip>
      ) : null}
      <Strip name="sidebar row">
        <div className="w-[240px] max-w-full overflow-hidden rounded-lg border border-border bg-panel py-1">
          {three.map((s, i) => (
            <div key={s.name} className={`flex h-9 items-center gap-2.5 px-3 ${i === 1 ? 'bg-panel-2' : ''}`}>
              <Glyph svg={s.svg} style={style} tone={inline} size={20} />
              <span className="truncate text-[13px] text-ink">{s.label}</span>
            </div>
          ))}
        </div>
      </Strip>
      {dark !== null ? (
        <Strip name="tab strip">
          <div className="flex h-10 overflow-hidden rounded-lg bg-navy">
            {three.map((s, i) => (
              <div
                key={s.name}
                className={`flex min-w-0 items-center gap-1.5 border-b-2 px-2.5 ${i === 0 ? 'border-white text-white' : 'border-transparent text-white/70'}`}
              >
                <Glyph svg={s.svg} style={style} tone={dark} size={20} />
                <span className="truncate text-[12.5px]">{s.label}</span>
              </div>
            ))}
          </div>
        </Strip>
      ) : null}
      <Strip name="chip">
        <div className="flex flex-wrap gap-1.5">
          {three.map((s) => (
            <span key={s.name} className="inline-flex h-6 items-center gap-1.5 rounded-md bg-panel-2 px-2">
              <Glyph svg={s.svg} style={style} tone={inline} size={16} />
              <span className="text-[12.5px] text-ink">{s.label}</span>
            </span>
          ))}
        </div>
      </Strip>
    </div>
  )
}
