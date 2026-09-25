import type { ReactNode } from 'react'

export function EmptyState({ message, children }: { readonly message: string; readonly children?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-4 rounded-xl border border-border bg-panel p-6">
      <p className="text-ink-2">{message}</p>
      {children}
    </div>
  )
}
