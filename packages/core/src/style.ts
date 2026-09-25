import { createHash } from 'node:crypto'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import { z } from 'zod'
import { isCssColor } from './color'
import { NAME_RE } from './svg'
import { ROLES } from './types'
import type { Finding, Gradient, IconStyle, Result, ToneStyle } from './types'

const STOP_PCT_RE = /^(.+?)\s+(-?(?:\d+(?:\.\d*)?|\.\d+))%$/

/** Splits a gradient stop `"<colour>"` / `"<colour> <n>%"` into colour and optional 0..1 offset. */
function splitStop(stop: string): { color: string; offset: number | null } {
  const s = stop.trim()
  const m = STOP_PCT_RE.exec(s)
  if (m?.[1] !== undefined && m[2] !== undefined) return { color: m[1].trim(), offset: Number(m[2]) / 100 }
  return { color: s, offset: null }
}

export const GradientSchema = z
  .object({ angle: z.number().finite(), stops: z.array(z.string().min(1)).min(2) })
  .superRefine((g, ctx) => {
    g.stops.forEach((stop, i) => {
      if (!isCssColor(splitStop(stop).color)) {
        ctx.addIssue({
          code: 'custom',
          path: ['stops', i],
          message: `gradient stop "${stop}" must be "<colour>" or "<colour> <n>%" with a #hex, rgb() or rgba() colour`,
        })
      }
    })
  })

const color = z.string().refine(isCssColor, { message: 'colour must be #hex, rgb() or rgba()' })

export const ToneSchema = z
  .object({
    line: color,
    plane: color,
    accent: color.optional(),
    on: color.default('#FFFFFF'),
    bg: z.union([color, GradientSchema]).optional(),
    radius: z.string().optional(),
    shadow: z.string().optional(),
    scale: z.number().min(0.3).max(1).default(0.6),
  })
  .transform((t) => (t.bg !== undefined && t.radius === undefined ? { ...t, radius: '25%' } : t))

export const IconMdFrontmatterSchema = z
  .object({
    sigil: z.literal(1),
    grid: z.number().int().min(8).max(256).default(32),
    keyline: z.tuple([z.number(), z.number()]).default([3, 29]),
    stroke: z.number().positive().default(2),
    caps: z.enum(['round', 'butt', 'square']).default('round'),
    joins: z.enum(['round', 'miter', 'bevel']).default('round'),
    radius: z.record(z.string(), z.number().nonnegative()).default({}),
    optical: z
      .object({ circle: z.number(), square: z.number(), tall: z.number(), wide: z.number() })
      .default({ circle: 24, square: 22, tall: 25, wide: 25 }),
    roles: z.array(z.enum(ROLES)).min(1).default(['plane', 'line', 'dot']),
    tones: z
      .record(z.string().regex(NAME_RE), ToneSchema)
      .refine((t) => Object.keys(t).length > 0, 'at least one tone'),
    detail_budget: z
      .object({
        inner_marks: z.tuple([z.number().int(), z.number().int()]),
        min_gap: z.number().positive(),
        min_px: z.number().int().positive(),
      })
      .default({ inner_marks: [2, 5], min_gap: 2.5, min_px: 16 }),
    checks: z
      .object({
        max_ink_16: z.number().min(0).max(1).default(0.35),
        collision_iou: z.number().min(0).max(1).default(0.88),
        collision_body: z.number().min(0).max(1).default(0.85),
        optical_tolerance: z.number().nonnegative().default(3),
      })
      .default({ max_ink_16: 0.35, collision_iou: 0.88, collision_body: 0.85, optical_tolerance: 3 }),
    references: z.array(z.string()).default([]),
  })
  .superRefine((fm, ctx) => {
    if (!fm.roles.includes('accent')) return
    for (const [name, tone] of Object.entries(fm.tones)) {
      if (tone.accent === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['tones', name, 'accent'],
          message: `tone "${name}" needs an accent colour because roles include accent`,
        })
      }
    }
  })

/** The YAML-shaped (snake_case) frontmatter, before defaults. */
export type IconMdFrontmatter = z.input<typeof IconMdFrontmatterSchema>
type ParsedFrontmatter = z.output<typeof IconMdFrontmatterSchema>
type ParsedTone = z.output<typeof ToneSchema>

const styleFinding = (rule: string, message: string): Finding => ({ icon: 'icon.md', rule, severity: 'error', message })

function toTone(t: ParsedTone): ToneStyle {
  return {
    line: t.line,
    plane: t.plane,
    on: t.on,
    scale: t.scale,
    ...(t.accent !== undefined ? { accent: t.accent } : {}),
    ...(t.bg !== undefined ? { bg: t.bg } : {}),
    ...(t.radius !== undefined ? { radius: t.radius } : {}),
    ...(t.shadow !== undefined ? { shadow: t.shadow } : {}),
  }
}

function toStyle(fm: ParsedFrontmatter, body: string, raw: string): IconStyle {
  const tones: Record<string, ToneStyle> = {}
  for (const [name, t] of Object.entries(fm.tones)) tones[name] = toTone(t)
  return {
    sigil: fm.sigil,
    grid: fm.grid,
    keyline: fm.keyline,
    stroke: fm.stroke,
    caps: fm.caps,
    joins: fm.joins,
    radius: fm.radius,
    optical: fm.optical,
    roles: fm.roles,
    tones,
    detailBudget: {
      innerMarks: fm.detail_budget.inner_marks,
      minGap: fm.detail_budget.min_gap,
      minPx: fm.detail_budget.min_px,
    },
    checks: {
      maxInk16: fm.checks.max_ink_16,
      collisionIou: fm.checks.collision_iou,
      collisionBody: fm.checks.collision_body,
      opticalTolerance: fm.checks.optical_tolerance,
    },
    references: fm.references,
    body,
    raw,
    hash: createHash('sha256').update(raw).digest('hex'),
  }
}

export function parseIconMd(raw: string): Result<IconStyle> {
  const lines = raw.replace(/^﻿/, '').split('\n')
  const isFence = (line: string | undefined): boolean => line !== undefined && line.trimEnd() === '---'
  if (!isFence(lines[0])) {
    return { ok: false, findings: [styleFinding('style.frontmatter', 'icon.md must start with a --- frontmatter block')] }
  }
  const close = lines.findIndex((line, i) => i > 0 && isFence(line))
  if (close === -1) {
    return { ok: false, findings: [styleFinding('style.frontmatter', 'icon.md frontmatter has no closing --- line')] }
  }
  const yamlText = lines.slice(1, close).join('\n')
  const body = lines.slice(close + 1).join('\n')

  let data: unknown
  try {
    data = parseYaml(yamlText)
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    return { ok: false, findings: [styleFinding('style.yaml', `frontmatter is not valid YAML: ${reason}`)] }
  }

  const parsed = IconMdFrontmatterSchema.safeParse(data)
  if (!parsed.success) {
    return {
      ok: false,
      findings: parsed.error.issues.map((issue) => {
        const path = issue.path.length > 0 ? issue.path.map(String).join('.') : '(root)'
        return styleFinding('style.schema', `${path}: ${issue.message}`)
      }),
    }
  }
  return { ok: true, value: toStyle(parsed.data, body, raw) }
}

export function serializeIconMd(frontmatter: IconMdFrontmatter, body: string): string {
  const text = body.replace(/\n+$/, '')
  return `---\n${stringifyYaml(frontmatter, { lineWidth: 0 })}---\n${text}\n`
}

const gradientToFrontmatter = (g: Gradient): { angle: number; stops: string[] } => ({ angle: g.angle, stops: [...g.stops] })

export function styleToFrontmatter(style: IconStyle): IconMdFrontmatter {
  const tones: IconMdFrontmatter['tones'] = {}
  for (const [name, t] of Object.entries(style.tones)) {
    tones[name] = {
      line: t.line,
      plane: t.plane,
      ...(t.accent !== undefined ? { accent: t.accent } : {}),
      on: t.on,
      ...(t.bg !== undefined ? { bg: typeof t.bg === 'string' ? t.bg : gradientToFrontmatter(t.bg) } : {}),
      ...(t.radius !== undefined ? { radius: t.radius } : {}),
      ...(t.shadow !== undefined ? { shadow: t.shadow } : {}),
      scale: t.scale,
    }
  }
  return {
    sigil: 1,
    grid: style.grid,
    keyline: [style.keyline[0], style.keyline[1]],
    stroke: style.stroke,
    caps: style.caps,
    joins: style.joins,
    radius: { ...style.radius },
    optical: { ...style.optical },
    roles: [...style.roles],
    tones,
    detail_budget: {
      inner_marks: [style.detailBudget.innerMarks[0], style.detailBudget.innerMarks[1]],
      min_gap: style.detailBudget.minGap,
      min_px: style.detailBudget.minPx,
    },
    checks: {
      max_ink_16: style.checks.maxInk16,
      collision_iou: style.checks.collisionIou,
      collision_body: style.checks.collisionBody,
      optical_tolerance: style.checks.opticalTolerance,
    },
    references: [...style.references],
  }
}

/** Offsets 0..1. Explicit `%` stops are kept; the rest spread evenly between explicit neighbours. */
export function resolveGradientStops(g: Gradient): { color: string; offset: number }[] {
  const stops = g.stops.map(splitStop)
  const offsets = stops.map((s) => s.offset)
  const last = offsets.length - 1
  if (last < 0) return []
  if (offsets[0] === null) offsets[0] = 0
  if (offsets[last] === null) offsets[last] = 1
  let prev = 0
  for (let i = 1; i <= last; i++) {
    const end = offsets[i]
    if (end === null || end === undefined) continue
    const start = offsets[prev] ?? 0
    const span = i - prev
    for (let k = prev + 1; k < i; k++) offsets[k] = start + ((end - start) * (k - prev)) / span
    prev = i
  }
  return stops.map((s, i) => ({ color: s.color, offset: offsets[i] ?? 0 }))
}
