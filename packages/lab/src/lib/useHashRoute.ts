import { useEffect, useState } from 'react'

export const ROUTES = ['directions', 'library', 'jobs', 'debug'] as const
export type Route = (typeof ROUTES)[number]

function parse(hash: string): Route | null {
  const key = hash.replace(/^#/, '')
  return ROUTES.find((r) => r === key) ?? null
}

/** Hash-only routing: `#directions`, `#library`, `#jobs`, `#debug`. An empty or unknown hash follows `fallback`. */
export function useHashRoute(fallback: Route): Route {
  const [hash, setHash] = useState(() => window.location.hash)
  useEffect(() => {
    const onChange = (): void => setHash(window.location.hash)
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return parse(hash) ?? fallback
}

export function goTo(route: Route): void {
  window.location.hash = `#${route}`
}
