import { money } from '../lib/format'
import { ROUTES, type Route } from '../lib/useHashRoute'

const LABELS: Record<Route, string> = { directions: 'Directions', library: 'Library', jobs: 'Jobs', debug: 'Debug' }

export interface TopBarProps {
  readonly root: string | null
  readonly route: Route
  readonly costUsd: number
}

export function TopBar({ root, route, costUsd }: TopBarProps) {
  return (
    <header className="fixed inset-x-0 top-0 z-40 flex h-12 items-center gap-4 border-b border-border bg-panel px-6 max-sm:gap-3 max-sm:px-4">
      <span className="mono shrink-0 text-[14px] font-semibold text-ink">Sigil</span>
      {root !== null ? (
        <span
          title={root}
          className="mono min-w-0 max-w-[36ch] shrink truncate text-ink-2 max-sm:hidden"
          style={{ direction: 'rtl', textAlign: 'left' }}
        >
          {/* LRM keeps a leading slash from flipping to the end under rtl */}
          {`‎${root}‎`}
        </span>
      ) : null}
      <nav className="flex h-full items-stretch gap-1">
        {ROUTES.map((r) => {
          const active = r === route
          return (
            <a
              key={r}
              href={`#${r}`}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center border-b-2 px-2.5 text-[13px] ${active ? 'border-ink font-semibold text-ink' : 'border-transparent text-ink-2 hover:text-ink'}`}
            >
              {LABELS[r]}
            </a>
          )
        })}
      </nav>
      <span className="mono ml-auto shrink-0 whitespace-nowrap text-ink-2">
        {money(costUsd)}
        <span className="max-sm:hidden"> this session</span>
      </span>
    </header>
  )
}
