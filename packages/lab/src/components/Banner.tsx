import { Button } from './Button'

export interface BannerProps {
  readonly message: string
  readonly onRetry?: () => void
  readonly onDismiss?: () => void
}

export function Banner({ message, onRetry, onDismiss }: BannerProps) {
  return (
    <div role="alert" className="flex items-center gap-3 rounded-lg border border-error bg-panel px-4 py-2.5">
      <span className="min-w-0 flex-1 break-words text-ink">{message}</span>
      {onRetry !== undefined ? (
        <Button size="sm" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
      {onDismiss !== undefined ? (
        <button type="button" aria-label="Dismiss" onClick={onDismiss} className="px-1 text-lg leading-none text-ink-3 hover:text-ink">
          ×
        </button>
      ) : null}
    </div>
  )
}
