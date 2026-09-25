// Converts frozenropes glyph modules (apps/web/src/components/icons/glyphs/*.ts)
// into canonical Sigil SVG sources. frozenropes stays the source of truth until M5.
// Usage: bun scripts/convert-frozone.ts [--from <glyphsDir>] [--out <srcDir>] [--manifest <manifest.json>]
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'

const { values } = parseArgs({
  options: {
    from: { type: 'string', default: 'G:/code/frozenropes/apps/web/src/components/icons/glyphs' },
    out: { type: 'string', default: 'fixtures/frozone/icons/src' },
    manifest: { type: 'string', default: 'fixtures/frozone/icons/manifest.json' },
  },
})

const shapeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('path'), d: z.string() }),
  z.object({ kind: z.literal('circle'), cx: z.number(), cy: z.number(), r: z.number() }),
  z.object({
    kind: z.literal('rect'),
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
    rx: z.number(),
  }),
])
const glyphSchema = z.array(
  z.object({ role: z.enum(['plane', 'line', 'dot']), shapes: z.array(shapeSchema).min(1) }),
)
const moduleSchema = z.object({ default: glyphSchema })
const manifestSchema = z.record(z.string(), z.object({ brief: z.string(), group: z.string().optional() }))

type GlyphShape = z.infer<typeof shapeSchema>
type Glyph = z.infer<typeof glyphSchema>

const num = (n: number): string => Number(n.toFixed(3)).toString()
const escapeAttr = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const shapeSvg = (s: GlyphShape): string => {
  switch (s.kind) {
    case 'path':
      return `<path d="${escapeAttr(s.d)}"/>`
    case 'circle':
      return `<circle cx="${num(s.cx)}" cy="${num(s.cy)}" r="${num(s.r)}"/>`
    case 'rect': {
      const rx = s.rx === 0 ? '' : ` rx="${num(s.rx)}"`
      return `<rect x="${num(s.x)}" y="${num(s.y)}" width="${num(s.width)}" height="${num(s.height)}"${rx}/>`
    }
  }
}

const toSvg = (glyph: Glyph, brief: string): string => {
  const briefAttr = brief === '' ? '' : ` data-brief="${escapeAttr(brief)}"`
  const groups = glyph.map((layer) => `  <g data-role="${layer.role}">${layer.shapes.map(shapeSvg).join('')}</g>\n`)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" data-sigil="1"${briefAttr}>\n${groups.join('')}</svg>\n`
}

const main = async (): Promise<void> => {
  const fromDir = resolve(values.from)
  const outDir = resolve(values.out)
  const manifest = manifestSchema.parse(JSON.parse(readFileSync(resolve(values.manifest), 'utf8')))

  mkdirSync(outDir, { recursive: true })
  const files = readdirSync(fromDir)
    .filter((f) => f.endsWith('.ts'))
    .sort()

  let count = 0
  for (const file of files) {
    const name = basename(file, '.ts')
    const loaded: unknown = await import(pathToFileURL(join(fromDir, file)).href)
    const parsed = moduleSchema.safeParse(loaded)
    if (!parsed.success) throw new Error(`${file}: not a glyph module\n${z.prettifyError(parsed.error)}`)
    const entry = manifest[name]
    if (entry === undefined) console.warn(`warn: ${name} has no manifest entry; writing without a brief`)
    writeFileSync(join(outDir, `${name}.svg`), toSvg(parsed.data.default, entry?.brief ?? ''))
    count++
  }

  console.log(`${count} icons → ${outDir}`)
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
