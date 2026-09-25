import { useEffect, useState } from 'react'

/** Epoch ms that re-renders the caller every `ms` while `active`; frozen otherwise. */
export function useNow(active: boolean, ms = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const t = window.setInterval(() => setNow(Date.now()), ms)
    return () => window.clearInterval(t)
  }, [active, ms])
  return now
}
