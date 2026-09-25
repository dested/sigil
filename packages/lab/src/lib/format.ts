const pad2 = (n: number): string => String(n).padStart(2, '0')

export function money(n: number): string {
  return `$${n.toFixed(2)}`
}

/** `now` is injectable so ticking timers and tests share one clock. */
export function elapsed(startIso: string, endIso?: string, now: number = Date.now()): string {
  const end = endIso === undefined ? now : Date.parse(endIso)
  const total = Math.max(0, Math.floor((end - Date.parse(startIso)) / 1000))
  if (Number.isNaN(total)) return '—'
  if (total < 60) return `${total}s`
  const m = Math.floor(total / 60)
  if (m < 60) return `${m}m ${pad2(total % 60)}s`
  return `${Math.floor(m / 60)}h ${pad2(m % 60)}m`
}

export function timeAgo(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 1000))
  if (Number.isNaN(s)) return '—'
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export function titleCase(kebab: string): string {
  return kebab
    .split('-')
    .filter((w) => w !== '')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/** Local wall-clock `HH:MM:SS` of an ISO timestamp. */
export function clock(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '--:--:--'
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

export function bytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}
