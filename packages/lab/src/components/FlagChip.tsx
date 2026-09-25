export interface FlagChipProps {
  readonly severity: 'error' | 'warn'
  readonly rule: string
  /** Findings collapsed into this chip; shown as `×n` when above 1. */
  readonly count?: number
}

export function FlagChip({ severity, rule, count = 1 }: FlagChipProps) {
  const tone = severity === 'error' ? 'border-error text-error' : 'border-warn text-warn'
  return (
    <span className={`mono inline-flex h-5 shrink-0 items-center rounded-md border bg-transparent px-1.5 ${tone}`}>
      {count > 1 ? `${rule} ×${count}` : rule}
    </span>
  )
}

/** A chip with its message beside it, per ui.md: no tooltips. */
export function Flag({ severity, rule, message, count = 1 }: FlagChipProps & { readonly message: string }) {
  return (
    <span className="flex items-start gap-2">
      <FlagChip severity={severity} rule={rule} count={count} />
      <span className="text-[13px] text-ink-2">
        {message}
        {count > 1 ? <span className="text-ink-3"> +{count - 1} more</span> : null}
      </span>
    </span>
  )
}

export interface FindingLike {
  readonly rule: string
  readonly severity: 'error' | 'warn'
  readonly message: string
}

export interface FlagGroup {
  readonly rule: string
  readonly severity: 'error' | 'warn'
  readonly message: string
  readonly count: number
}

/** One group per rule (first message kept, severity escalates to error), errors first, otherwise first-seen order. */
export function groupFindings(findings: readonly FindingLike[]): FlagGroup[] {
  const groups = new Map<string, FlagGroup>()
  for (const f of findings) {
    const g = groups.get(f.rule)
    groups.set(
      f.rule,
      g === undefined
        ? { rule: f.rule, severity: f.severity, message: f.message, count: 1 }
        : { ...g, count: g.count + 1, severity: g.severity === 'error' || f.severity === 'error' ? 'error' : 'warn' },
    )
  }
  const list = [...groups.values()]
  return [...list.filter((g) => g.severity === 'error'), ...list.filter((g) => g.severity !== 'error')]
}
