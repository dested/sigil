import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import type { IconStyle } from '../types'

export interface CacheEntry {
  readonly key: string
  readonly svg: string
  readonly rationale: string
  readonly critique: string
  readonly rounds: number
  readonly costUsd: number
  readonly drawnAt: string
  readonly jobId: string
  readonly status: 'done' | 'unresolved'
}

export const CacheEntrySchema = z.object({
  key: z.string(),
  svg: z.string(),
  rationale: z.string(),
  critique: z.string(),
  rounds: z.number(),
  costUsd: z.number(),
  drawnAt: z.string(),
  jobId: z.string(),
  status: z.enum(['done', 'unresolved']),
})

export function cacheKey(style: IconStyle, name: string, brief: string, referenceSvgs: readonly string[]): string {
  const refs = [...referenceSvgs].sort().join('\n')
  return createHash('sha256').update(`${style.hash}\n${name}\n${brief}\n${refs}`).digest('hex')
}

export const cacheDir = (sigilDir: string): string => join(sigilDir, 'cache')

export function readCache(sigilDir: string, name: string): CacheEntry | null {
  const file = join(cacheDir(sigilDir), `${name}.json`)
  if (!existsSync(file)) return null
  let data: unknown
  try {
    data = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
  const parsed = CacheEntrySchema.safeParse(data)
  return parsed.success ? parsed.data : null
}

export function writeCache(sigilDir: string, entry: CacheEntry & { name: string }): void {
  const { name, ...rest } = entry
  mkdirSync(cacheDir(sigilDir), { recursive: true })
  writeFileSync(join(cacheDir(sigilDir), `${name}.json`), `${JSON.stringify(rest, null, 2)}\n`)
}
