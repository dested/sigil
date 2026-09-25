/** At most `n` wrapped calls in flight; the rest wait in FIFO order. */
export function createSemaphore(n: number): <T>(fn: () => Promise<T>) => Promise<T> {
  if (!Number.isInteger(n) || n < 1) throw new Error(`semaphore size must be a positive integer, got ${n}`)
  let active = 0
  const waiting: (() => void)[] = []
  const release = (): void => {
    const next = waiting.shift()
    if (next !== undefined) next()
    else active--
  }
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    if (active < n) active++
    // A releasing caller hands its slot straight to the next waiter, so `active` stays put.
    else await new Promise<void>((resolve) => waiting.push(resolve))
    try {
      return await fn()
    } finally {
      release()
    }
  }
}
