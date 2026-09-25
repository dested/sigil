import { readFileSync } from 'node:fs'
import { z } from 'zod'
import type { Finding, IconStyle } from '../types'

const readTemplate = (file: string): string => readFileSync(new URL(`./templates/${file}`, import.meta.url), 'utf8')

const num = (n: number): string => String(n)

const ACCENT_RULE = '- `accent` = a fourth colour for one emphasised element (the product\'s tones define it).'

export function fillSystemPrompt(style: IconStyle): string {
  const radii = Object.entries(style.radius).map(([k, v]) => `${k} ${num(v)}`)
  const values: Readonly<Record<string, string>> = {
    grid: num(style.grid),
    stroke: num(style.stroke),
    caps: style.caps,
    joins: style.joins,
    roles: style.roles.join(', '),
    keyline_lo: num(style.keyline[0]),
    keyline_hi: num(style.keyline[1]),
    radius: radii.length > 0 ? radii.join(', ') : 'none named',
    optical_circle: num(style.optical.circle),
    optical_square: num(style.optical.square),
    optical_tall: num(style.optical.tall),
    optical_wide: num(style.optical.wide),
    inner_marks_lo: num(style.detailBudget.innerMarks[0]),
    inner_marks_hi: num(style.detailBudget.innerMarks[1]),
    min_gap: num(style.detailBudget.minGap),
    min_px: num(style.detailBudget.minPx),
  }
  const withAccent = readTemplate('system.md').replace(
    /\{accent_rule\}(\r?\n)?/,
    (_whole, nl: string | undefined) => (style.roles.includes('accent') ? `${ACCENT_RULE}${nl ?? ''}` : ''),
  )
  // One pass, and the body goes in last, so braces in the developer's prose are never substituted.
  const filled = withAccent.replace(/\{([a-z_]+)\}/g, (whole, key: string) =>
    key === 'icon_md_body' ? whole : (values[key] ?? whole),
  )
  return filled.replace('{icon_md_body}', () => style.body)
}

export function fillDirectionsPrompt(): string {
  return readTemplate('directions.md')
}

// ---- structured output schemas ----------------------------------------------------------------

export const DRAW_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    icons: {
      type: 'array',
      items: {
        type: 'object',
        properties: { name: { type: 'string' }, svg: { type: 'string' }, rationale: { type: 'string' } },
        required: ['name', 'svg', 'rationale'],
      },
    },
  },
  required: ['icons'],
}

export const REVISE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    icons: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          pass: { type: 'boolean' },
          critique: { type: 'string' },
          svg: { type: 'string' },
        },
        required: ['name', 'pass', 'critique'],
      },
    },
  },
  required: ['icons'],
}

export const DIRECTIONS_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    directions: {
      type: 'array',
      items: {
        type: 'object',
        properties: { letter: { type: 'string' }, name: { type: 'string' }, iconMd: { type: 'string' } },
        required: ['letter', 'name', 'iconMd'],
      },
    },
  },
  required: ['directions'],
}

export const ITERATE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: { iconMd: { type: 'string' }, changes: { type: 'string' } },
  required: ['iconMd', 'changes'],
}

export const DrawOutputSchema = z.object({
  icons: z.array(z.object({ name: z.string(), svg: z.string(), rationale: z.string() })),
})
export const ReviseOutputSchema = z.object({
  icons: z.array(
    z.object({ name: z.string(), pass: z.boolean(), critique: z.string(), svg: z.string().exactOptional() }),
  ),
})
export const DirectionsOutputSchema = z.object({
  directions: z.array(z.object({ letter: z.string(), name: z.string(), iconMd: z.string() })),
})
export const IterateOutputSchema = z.object({ iconMd: z.string(), changes: z.string() })

export type DrawOutput = z.output<typeof DrawOutputSchema>
export type ReviseOutput = z.output<typeof ReviseOutputSchema>
export type DirectionsOutput = z.output<typeof DirectionsOutputSchema>
export type IterateOutput = z.output<typeof IterateOutputSchema>

// ---- round prompts -----------------------------------------------------------------------------

const listOrNone = (names: readonly string[]): string => (names.length > 0 ? names.map((n) => `\`${n}\``).join(', ') : 'none')

export function drawPrompt(args: {
  briefs: readonly { name: string; brief: string }[]
  groups: Readonly<Record<string, string | undefined>>
  neighboursPng: string
  neighbourNames: readonly string[]
  referenceNames: readonly string[]
  note?: string
}): string {
  const entries = args.briefs.map(({ name, brief }) => {
    const group = args.groups[name]
    return `- \`${name}\`${group !== undefined && group !== '' ? ` (group \`${group}\`)` : ''}: ${brief}`
  })
  const note = args.note !== undefined && args.note !== '' ? `\nNotes from the developer for this batch: ${args.note}` : ''
  return [
    "Draw these icons for this product. Each entry is the icon's name and the real object it must show.",
    '',
    ...entries,
    '',
    `References (the house hand; match their weight, radii and density): ${listOrNone(args.referenceNames)}. Neighbours already in the family (do not share a silhouette with any of them): ${listOrNone(args.neighbourNames)}. Both are rendered on the contact sheet at ${args.neighboursPng} — Read it before you draw.`,
    note,
    'Return JSON { "icons": [ { "name", "svg", "rationale" } ] } with one entry per name, in the order given. `svg` is the full SVG source string in the required format. `rationale` is one line: what object you drew and why it reads at 20px.',
  ].join('\n')
}

export function revisePrompt(args: {
  round: number
  pngPath: string
  findings: readonly Finding[]
  unresolved: readonly string[]
}): string {
  const findings =
    args.findings.length > 0
      ? args.findings.map((f) => `- \`${f.icon}\` [${f.rule}, ${f.severity}]: ${f.message}`)
      : ['- none']
  return [
    `Round ${args.round - 1} is rendered at ${args.pngPath} — Read it now. Look at every icon at 128 on the grid, in the tiles, and at 24 / 20 / 16.`,
    '',
    'Machine findings:',
    ...findings,
    '',
    `Still open this round: ${listOrNone(args.unresolved)}. Icons marked ✓ on the sheet have passed; leave them out.`,
    '',
    'For each icon, critique it honestly: legibility at 16px, silhouette versus the neighbours on the sheet, optical size, and whether a stranger would name the tool from the 20px version. Then either pass it or fix it. Return JSON { "icons": [ { "name", "pass", "critique", "svg" } ] } with one entry per icon: `pass: true` only when you would ship it as is (then omit `svg`); otherwise `pass: false` with the revised full `svg`. Icons that currently have an error finding cannot pass. Never return an icon unchanged with pass: false.',
  ].join('\n')
}

export function iteratePrompt(args: { iconMd: string; note: string }): string {
  return `Here is the current icon.md draft:\n\n\`\`\`md\n${args.iconMd}\n\`\`\`\n\nThe developer asks: "${args.note}"\n\nRevise the draft to honour the request while keeping everything else. Return JSON { "iconMd": "<full revised icon.md>", "changes": "<one paragraph: what changed and why>" }.`
}

export function directionsPrompt(args: {
  product: string
  names: readonly { name: string; brief: string }[]
  brand?: string
  hints?: string
  currentIconsNote?: string
}): string {
  const lines = args.names.map((n) => `- ${n.name}: ${n.brief}`).join('\n')
  const brand =
    args.brand !== undefined && args.brand !== ''
      ? `Brand colours: ${args.brand}`
      : 'No brand colours given: choose palettes that suit the product.'
  const hints = args.hints !== undefined && args.hints !== '' ? `Developer hints: ${args.hints}` : ''
  return `Product: ${args.product}.\n\nNavigation items that need icons:\n${lines}\n\n${brand}\n${hints}\n${args.currentIconsNote ?? ''}\n\nReturn the five directions as JSON.`
}
