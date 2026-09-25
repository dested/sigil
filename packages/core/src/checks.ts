import { countComponents, innerBBoxUnits, maskBBox, maskCoverage, maskIou, normalizeMask, normalizedIou, rasterizeMask, type Mask } from './raster'
import type { Finding, Icon, IconStyle } from './types'

export interface CheckOptions {
  /** name → group; icons without a group share group '' */
  readonly groups?: Readonly<Record<string, string>>
  /** extra icons included in collision comparison but never reported as the subject */
  readonly neighbours?: readonly Icon[]
}

const f1 = (n: number): string => n.toFixed(1)
const trim = (n: number): string => Number(n.toFixed(2)).toString()

export function checkIcon(icon: Icon, style: IconStyle): Finding[] {
  const out: Finding[] = []
  const at = (rule: string, severity: Finding['severity'], message: string): void => {
    out.push({ icon: icon.name, rule, severity, message })
  }
  const [ka, kb] = style.keyline
  const bb = innerBBoxUnits(icon, style)

  if (bb !== null && (bb.x0 < ka - 0.5 || bb.y0 < ka - 0.5 || bb.x1 > kb + 0.5 || bb.y1 > kb + 0.5)) {
    at('keyline', 'warn', `ink spans ${f1(bb.x0)}–${f1(bb.x1)} × ${f1(bb.y0)}–${f1(bb.y1)}, keyline is ${ka}–${kb}`)
  }

  const { minPx, minGap } = style.detailBudget
  const small = rasterizeMask(icon, style, minPx)
  // Planes are legitimate mass at small sizes; only strokes and marks turn to mush.
  const ink = maskCoverage(rasterizeMask(icon, style, minPx, { roles: ['line', 'dot'] }))
  if (ink > style.checks.maxInk16) {
    at('legibility.ink', 'error', `${Math.round(ink * 100)}% ink at ${minPx}px, max ${Math.round(style.checks.maxInk16 * 100)}%`)
  }

  const bigPx = icon.grid * 4
  const strokes = { roles: ['line', 'dot'] } as const
  const a = countComponents(rasterizeMask(icon, style, bigPx, { ...strokes, strokeWidth: style.stroke }))
  const b = countComponents(rasterizeMask(icon, style, bigPx, { ...strokes, strokeWidth: minGap }))
  if (b < a) at('legibility.gap', 'warn', `strokes closer than ${trim(minGap)} units merge (${a} → ${b} components)`)

  const bigMask = rasterizeMask(icon, style, bigPx)
  const bigN = countComponents(bigMask)
  const smallN = countComponents(small)
  if (smallN < bigN) {
    at('legibility.island', 'warn', `detail merges or vanishes at ${minPx}px (${bigN} → ${smallN} components)`)
  }

  if (bb !== null) {
    const w = bb.x1 - bb.x0
    const h = bb.y1 - bb.y0
    const tol = style.checks.opticalTolerance
    let shape: 'tall' | 'wide' | 'circle' | 'square'
    let actual: number
    if (w > 0 && h / w > 1.15) {
      shape = 'tall'
      actual = h
    } else if (h > 0 && w / h > 1.15) {
      shape = 'wide'
      actual = w
    } else {
      shape = inkedCorners(bigMask) >= 3 ? 'square' : 'circle'
      actual = Math.max(w, h)
    }
    const target = style.optical[shape]
    if (Math.abs(actual - target) > tol) {
      at('optical', 'warn', `${shape} reads ${f1(actual)} units, target ${trim(target)} (±${trim(tol)})`)
    }
  }
  return out
}

/** Corners of the ink bbox (each a 10% × 10% square, floored to whole pixels) that hold any ink. */
function inkedCorners(m: Mask): number {
  const bb = maskBBox(m)
  if (bb === null) return 0
  const cw = Math.max(1, Math.floor((bb.x1 - bb.x0 + 1) * CORNER))
  const ch = Math.max(1, Math.floor((bb.y1 - bb.y0 + 1) * CORNER))
  const inked = (xs: number, ys: number): boolean => {
    for (let y = ys; y < ys + ch; y++) for (let x = xs; x < xs + cw; x++) if (m.data[y * m.width + x] === 1) return true
    return false
  }
  const left = bb.x0
  const right = bb.x1 - cw + 1
  const top = bb.y0
  const bottom = bb.y1 - ch + 1
  return [inked(left, top), inked(right, top), inked(left, bottom), inked(right, bottom)].filter(Boolean).length
}

const CORNER = 0.1
const COLLISION_PX = 24
const BODY_SRC_PX = 96
const BOX_BODY = 0.88
const MAX_COLLISIONS = 2

export function checkFamily(icons: readonly Icon[], style: IconStyle, opts: CheckOptions = {}): Finding[] {
  const out: Finding[] = icons.flatMap((icon) => checkIcon(icon, style))
  const groupOf = (name: string): string => opts.groups?.[name] ?? ''
  const subjects = new Set(icons.map((i) => i.name))
  const pool = [...icons, ...(opts.neighbours ?? []).filter((n) => !subjects.has(n.name))]
  const cached = (cache: Map<string, Mask>, icon: Icon, make: () => Mask): Mask => {
    const hit = cache.get(icon.name)
    if (hit !== undefined) return hit
    const m = make()
    cache.set(icon.name, m)
    return m
  }
  const unions = new Map<string, Mask>()
  const bodies = new Map<string, Mask>()
  const maskOf = (icon: Icon): Mask => cached(unions, icon, () => rasterizeMask(icon, style, COLLISION_PX))
  const bodyOf = (icon: Icon): Mask =>
    cached(bodies, icon, () => rasterizeMask(icon, style, BODY_SRC_PX, { roles: ['plane'] }))
  const hasPlane = (icon: Icon): boolean => icon.layers.some((l) => l.role === 'plane')
  // A body that normalises to a near-full square is a plain box: it carries no gestalt, so every
  // rounded-rect icon would match every other. Such icons sit out the body signal.
  const gestalt = new Map<string, boolean>()
  const hasGestalt = (icon: Icon): boolean => {
    const hit = gestalt.get(icon.name)
    if (hit !== undefined) return hit
    const v = hasPlane(icon) && maskCoverage(normalizeMask(bodyOf(icon), COLLISION_PX)) < BOX_BODY
    gestalt.set(icon.name, v)
    return v
  }
  const hits: { finding: Finding; score: number }[] = []
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const p = pool[i]
      const q = pool[j]
      if (p === undefined || q === undefined || p.name === q.name) continue
      const pSub = subjects.has(p.name)
      const qSub = subjects.has(q.name)
      if (!pSub && !qSub) continue
      if (groupOf(p.name) !== groupOf(q.name)) continue
      // Two signals: raw overlap catches same-place shapes; the normalised plane body catches
      // same-shape masses drawn at different positions or sizes.
      const body = hasGestalt(p) && hasGestalt(q) ? normalizedIou(bodyOf(p), bodyOf(q), COLLISION_PX) : 0
      const iou = maskIou(maskOf(p), maskOf(q))
      const bodyHit = body >= style.checks.collisionBody
      if (!bodyHit && iou < style.checks.collisionIou) continue
      const detail = bodyHit ? `body IoU ${body.toFixed(2)}` : `IoU ${iou.toFixed(2)}`
      // Report on the lexically first subject; a neighbour is never the subject.
      const [subject, other]: readonly [Icon, Icon] = pSub && qSub ? (p.name < q.name ? [p, q] : [q, p]) : pSub ? [p, q] : [q, p]
      hits.push({
        score: Math.max(body, iou),
        finding: {
          icon: subject.name,
          rule: 'collision',
          severity: 'warn',
          message: `silhouette matches "${other.name}" (${detail})`,
          related: [other.name],
        },
      })
    }
  }
  const perSubject = new Map<string, number>()
  for (const h of [...hits].sort((x, y) => y.score - x.score)) {
    const n = perSubject.get(h.finding.icon) ?? 0
    if (n >= MAX_COLLISIONS) continue
    perSubject.set(h.finding.icon, n + 1)
    out.push(h.finding)
  }
  return out
}
