import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '../components/Button'
import { money } from '../lib/format'
import { useTRPC, type ProjectData } from '../trpc'

export interface GenerateFormProps {
  readonly root: string
  readonly manifest: ProjectData['manifest']
  readonly running: boolean
}

// Mirrors NAME_RE in @sigil/core svg.ts; importing core at runtime would drag node:fs into the bundle.
const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

interface ParsedLine {
  readonly name: string
  readonly brief: string
  readonly raw: string
}

export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/** `name[: brief]` per line; blank lines ignored, later duplicates win. */
export function parseIconLines(text: string): { readonly valid: ParsedLine[]; readonly invalid: string[] } {
  const byName = new Map<string, ParsedLine>()
  const invalid: string[] = []
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '') continue
    const colon = line.indexOf(':')
    const rawName = colon === -1 ? line : line.slice(0, colon)
    const brief = colon === -1 ? '' : line.slice(colon + 1).trim()
    const name = slugify(rawName)
    if (!NAME_RE.test(name)) invalid.push(rawName.trim() === '' ? line.trim() : rawName.trim())
    else byName.set(name, { name, brief, raw: line })
  }
  return { valid: [...byName.values()], invalid }
}

const lastSegment = (path: string): string => path.split(/[\\/]/).filter((s) => s !== '').at(-1) ?? ''

const field = 'rounded-lg border border-border bg-panel px-2.5 text-[13px] outline-none focus:border-ink'

export function GenerateForm({ root, manifest, running }: GenerateFormProps) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const manifestNames = Object.keys(manifest)
  const [product, setProduct] = useState(() => lastSegment(root))
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set(manifestNames.slice(0, 10)))
  // Parsed names start ticked; this tracks the ones the user unticked.
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(() => new Set())
  const [added, setAdded] = useState('')
  const [brand, setBrand] = useState('')
  const [hints, setHints] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // Groups from suggestions ride along to setBrief so the manifest keeps them.
  const [groups, setGroups] = useState<ReadonlyMap<string, string>>(() => new Map())
  const [suggested, setSuggested] = useState<{ readonly count: number; readonly costUsd: number } | null>(null)
  const setBrief = useMutation(trpc.project.setBrief.mutationOptions())
  const generate = useMutation(trpc.directions.generate.mutationOptions())
  const suggest = useMutation(
    trpc.project.suggest.mutationOptions({
      onSuccess: (res) => {
        const have = new Set(parseIconLines(added).valid.map((p) => p.name))
        const fresh: { name: string; brief: string; group: string }[] = []
        for (const icon of res.icons) {
          const name = slugify(icon.name)
          if (name === '' || have.has(name)) continue
          have.add(name)
          fresh.push({ name, brief: icon.brief.replace(/\s+/g, ' ').trim(), group: icon.group })
        }
        if (fresh.length > 0) {
          const lines = fresh.map((f) => `${f.name}: ${f.brief}`).join('\n')
          setAdded((prev) => (prev.trim() === '' ? lines : `${prev.replace(/\s+$/, '')}\n${lines}`))
          setExcluded((prev) => new Set([...prev].filter((n) => !fresh.some((f) => f.name === n))))
          setGroups((prev) => {
            const next = new Map(prev)
            for (const f of fresh) if (f.group !== '') next.set(f.name, f.group)
            return next
          })
        }
        setSuggested({ count: fresh.length, costUsd: res.costUsd })
      },
    }),
  )

  const parsed = parseIconLines(added)
  const parsedNames = parsed.valid.map((p) => p.name)
  const parsedSet = new Set(parsedNames)
  const listed = [...parsedNames, ...manifestNames.filter((n) => !parsedSet.has(n))]
  const isOn = (n: string): boolean => (parsedSet.has(n) ? !excluded.has(n) : picked.has(n))
  const chosen = listed.filter(isOn)

  const toggle = (name: string, on: boolean): void => {
    const update = (prev: ReadonlySet<string>, add: boolean): ReadonlySet<string> => {
      const next = new Set(prev)
      if (add) next.add(name)
      else next.delete(name)
      return next
    }
    if (parsedSet.has(name)) setExcluded((prev) => update(prev, !on))
    else setPicked((prev) => update(prev, on))
  }

  const submit = async (): Promise<void> => {
    setSubmitting(true)
    try {
      for (const p of parsed.valid) {
        const existing = manifest[p.name]
        if (existing === undefined || existing.brief !== p.brief) {
          const group = groups.get(p.name)
          await setBrief.mutateAsync({ name: p.name, brief: p.brief, ...(group !== undefined ? { group } : {}) })
        }
      }
      const b = brand.trim()
      const h = hints.trim()
      await generate.mutateAsync({
        names: chosen,
        product: product.trim(),
        ...(b !== '' ? { brand: b } : {}),
        ...(h !== '' ? { hints: h } : {}),
      })
    } catch {
      // The failed mutation stays in the mutation cache, where App's banner reports it.
    } finally {
      setSubmitting(false)
      await queryClient.invalidateQueries()
    }
  }

  return (
    <form
      className="flex w-full max-w-[720px] flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <label className="flex flex-col gap-1">
        <span className="text-[13px] text-ink-2">Product</span>
        <input value={product} onChange={(e) => setProduct(e.target.value)} className={`${field} h-8`} />
      </label>
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="sg-add-icons" className="text-[13px] text-ink-2">
            Add icons
          </label>
          <Button
            size="sm"
            busy={suggest.isPending}
            disabled={product.trim() === '' || submitting}
            onClick={() => {
              const b = brand.trim()
              const h = hints.trim()
              suggest.mutate({
                product: product.trim(),
                count: 10,
                ...(b !== '' ? { brand: b } : {}),
                ...(h !== '' ? { hints: h } : {}),
              })
            }}
          >
            Suggest icons
          </Button>
        </div>
        <textarea
          id="sg-add-icons"
          value={added}
          rows={3}
          placeholder={'home: a friendly house with a round door\ngames: a game controller'}
          onChange={(e) => setAdded(e.target.value)}
          className={`${field} mono py-2`}
        />
        <span className="text-[12.5px] text-ink-3">one per line, name: what it draws</span>
        {suggested !== null ? (
          <span className="mono text-ink-3">
            suggested {suggested.count} icons · {money(suggested.costUsd)}
          </span>
        ) : null}
        {parsed.invalid.map((raw) => (
          <span key={raw} className="text-[12.5px] text-error">
            “{raw}” is not a valid icon name; use letters, digits and dashes
          </span>
        ))}
      </div>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 flex w-full items-baseline gap-2 text-[13px] text-ink-2">
          Sample icons
          <span className="mono text-ink-3">
            {chosen.length} / {listed.length}
          </span>
        </legend>
        {listed.length === 0 ? (
          <p className="text-[13px] text-ink-3">No icons in the manifest yet. Add a few above.</p>
        ) : (
          <div className="grid max-h-[240px] grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-x-4 gap-y-1 overflow-y-auto rounded-lg border border-border bg-panel-2 p-3">
            {listed.map((n) => (
              <label key={n} className="flex min-w-0 items-center gap-2">
                <input
                  type="checkbox"
                  checked={isOn(n)}
                  onChange={(e) => toggle(n, e.target.checked)}
                  className="size-4 shrink-0 accent-ink"
                />
                <span className={`mono truncate ${parsedSet.has(n) && manifest[n] === undefined ? 'text-ink-2' : 'text-ink'}`}>
                  {n}
                </span>
              </label>
            ))}
          </div>
        )}
      </fieldset>
      <label className="flex flex-col gap-1">
        <span className="text-[13px] text-ink-2">Brand colours</span>
        <input
          value={brand}
          placeholder="#8A1E3D maroon, navy #0F1F3A"
          onChange={(e) => setBrand(e.target.value)}
          className={`${field} h-8`}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[13px] text-ink-2">Hints</span>
        <textarea
          value={hints}
          rows={3}
          placeholder="Who uses it, what it should feel like, what to avoid"
          onChange={(e) => setHints(e.target.value)}
          className={`${field} py-2`}
        />
      </label>
      <div>
        <Button
          type="submit"
          variant="primary"
          busy={submitting}
          disabled={running || suggest.isPending || chosen.length === 0 || product.trim() === ''}
        >
          Generate five directions
        </Button>
      </div>
    </form>
  )
}
