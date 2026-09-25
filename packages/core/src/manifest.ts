import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { NAME_RE } from './svg'
import type { Manifest, ManifestEntry } from './types'

export const ManifestEntrySchema = z.object({
  brief: z.string(),
  group: z.string().optional(),
  lucide: z.string().optional(),
  approved: z.boolean().optional(),
})
export const ManifestSchema = z.record(z.string().regex(NAME_RE), ManifestEntrySchema)

type ParsedEntry = z.output<typeof ManifestEntrySchema>

const toEntry = (e: ParsedEntry): ManifestEntry => ({
  brief: e.brief,
  ...(e.group !== undefined ? { group: e.group } : {}),
  ...(e.lucide !== undefined ? { lucide: e.lucide } : {}),
  ...(e.approved !== undefined ? { approved: e.approved } : {}),
})

export function readManifest(iconsDir: string): Manifest {
  const file = join(iconsDir, 'manifest.json')
  if (!existsSync(file)) return {}
  let data: unknown
  try {
    data = JSON.parse(readFileSync(file, 'utf8'))
  } catch (err) {
    throw new Error(`icons/manifest.json: ${err instanceof Error ? err.message : String(err)}`)
  }
  const parsed = ManifestSchema.safeParse(data)
  if (!parsed.success) {
    const reason = parsed.error.issues
      .map((i) => `${i.path.length > 0 ? i.path.map(String).join('.') : '(root)'}: ${i.message}`)
      .join('; ')
    throw new Error(`icons/manifest.json: ${reason}`)
  }
  const out: Record<string, ManifestEntry> = {}
  for (const [name, entry] of Object.entries(parsed.data)) out[name] = toEntry(entry)
  return out
}

export function writeManifest(iconsDir: string, m: Manifest): void {
  const sorted: Record<string, ManifestEntry> = {}
  for (const name of Object.keys(m).sort()) {
    const entry = m[name]
    if (entry !== undefined) sorted[name] = entry
  }
  mkdirSync(iconsDir, { recursive: true })
  writeFileSync(join(iconsDir, 'manifest.json'), `${JSON.stringify(sorted, null, 2)}\n`)
}

export function upsertManifest(m: Manifest, name: string, patch: Partial<ManifestEntry> & { brief?: string }): Manifest {
  const base: ManifestEntry = m[name] ?? { brief: '' }
  return { ...m, [name]: { ...base, ...patch } }
}
