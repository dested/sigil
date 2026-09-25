/** 2px indeterminate bar pinned under the 48px top bar. */
export function ProgressBar() {
  return (
    <div role="progressbar" aria-label="Working" className="fixed inset-x-0 top-12 z-30 h-0.5 overflow-hidden bg-border">
      <div className="sg-progress h-full w-1/3 bg-ink" />
    </div>
  )
}
