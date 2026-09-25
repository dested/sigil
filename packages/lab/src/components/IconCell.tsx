import { useMemo, type CSSProperties } from 'react'
import { glyphMarkup, isTile, tileMarkup, type ToneSource } from '../lib/glyph'

interface GlyphProps {
  readonly svg: string
  readonly style: ToneSource
  readonly tone: string
  readonly size: number
}

function markupFor({ svg, style, tone, size }: GlyphProps): string | null {
  const t = style.tones[tone]
  try {
    return t !== undefined && isTile(t) ? tileMarkup(svg, { tone, size, scale: t.scale }) : glyphMarkup(svg, { tone, size })
  } catch {
    return null
  }
}

/** One icon at true size in one tone. Tile tones render the whole tile at `size`. Sources are the project's own files. */
export function Glyph(props: GlyphProps) {
  const { svg, style, tone, size } = props
  const html = useMemo(() => markupFor({ svg, style, tone, size }), [svg, style, tone, size])
  const box: CSSProperties = { width: size, height: size }
  if (html === null) {
    return <span title="unreadable svg" className="inline-block shrink-0 rounded-sm bg-panel-2 outline outline-1 outline-error" style={box} />
  }
  return <span className="inline-flex shrink-0 leading-none" style={box} dangerouslySetInnerHTML={{ __html: html }} />
}

export interface IconCellProps {
  readonly svg: string | null
  readonly style: ToneSource
  readonly tone: string
  readonly size: number
  readonly label?: string
  readonly grid?: boolean
  /** Drops the card border and padding (library table cells). */
  readonly bare?: boolean
}

export function IconCell({ svg, style, tone, size, label, grid = false, bare = false }: IconCellProps) {
  const t = style.tones[tone]
  const tile = t !== undefined && isTile(t)
  const surface: CSSProperties = !tile && t !== undefined ? { backgroundColor: t.on } : {}
  const glyph =
    svg === null ? (
      <span className="mono flex items-center justify-center text-ink-3" style={{ width: size, height: size }}>
        —
      </span>
    ) : (
      <Glyph svg={svg} style={style} tone={tone} size={size} />
    )
  // The grid box is exactly size×size with no padding so its 16px lines start at 0 and land on the icon's own grid.
  const inner = (
    <div className={`flex items-center justify-center rounded-md ${tile ? '' : 'p-1.5'}`} style={surface}>
      {grid ? (
        <div className="grid-bg flex items-center justify-center" style={{ ...surface, width: size, height: size }}>
          {glyph}
        </div>
      ) : (
        glyph
      )}
    </div>
  )
  const caption = <span className="mono leading-none text-ink-3">{label ?? String(size)}</span>
  if (bare) {
    return (
      <div className="inline-flex flex-col items-center gap-1">
        {inner}
        {caption}
      </div>
    )
  }
  return (
    <div className="inline-flex flex-col items-center gap-1 rounded-lg border border-border bg-panel p-2">
      {inner}
      {caption}
    </div>
  )
}
