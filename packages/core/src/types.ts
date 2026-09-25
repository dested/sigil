// Shared types for the whole system. Fable-owned: agents read, never edit.
// Contract: plans/2026-09-25-sigil-architecture.md

export type Role = 'plane' | 'line' | 'dot' | 'accent'
export const ROLES = ['plane', 'line', 'dot', 'accent'] as const satisfies readonly Role[]

export type Shape =
  | { readonly kind: 'path'; readonly d: string }
  | { readonly kind: 'circle'; readonly cx: number; readonly cy: number; readonly r: number }
  | {
      readonly kind: 'rect'
      readonly x: number
      readonly y: number
      readonly width: number
      readonly height: number
      readonly rx: number
    }
  | { readonly kind: 'line'; readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number }
  | { readonly kind: 'polyline'; readonly points: readonly (readonly [number, number])[] }

export interface Layer {
  readonly role: Role
  readonly shapes: readonly Shape[]
}

/** One drawing: ordered layers on a grid×grid viewBox, no colour. */
export interface Icon {
  readonly name: string
  readonly brief: string
  readonly grid: number
  readonly layers: readonly Layer[]
}

export type Gradient = { readonly angle: number; readonly stops: readonly string[] }

export interface ToneStyle {
  readonly line: string
  readonly plane: string
  readonly accent?: string
  /** Surface colour the tone sits on. Ignored for tile tones (bg is the surface). */
  readonly on: string
  /** Present ⇒ tile tone: glyph inside a rounded box of `radius`, at `scale` × box. */
  readonly bg?: string | Gradient
  readonly radius?: string
  readonly shadow?: string
  readonly scale: number
}

export interface IconStyle {
  readonly sigil: 1
  readonly grid: number
  readonly keyline: readonly [number, number]
  readonly stroke: number
  readonly caps: 'round' | 'butt' | 'square'
  readonly joins: 'round' | 'miter' | 'bevel'
  readonly radius: Readonly<Record<string, number>>
  readonly optical: { readonly circle: number; readonly square: number; readonly tall: number; readonly wide: number }
  readonly roles: readonly Role[]
  readonly tones: Readonly<Record<string, ToneStyle>>
  readonly detailBudget: { readonly innerMarks: readonly [number, number]; readonly minGap: number; readonly minPx: number }
  readonly checks: {
    readonly maxInk16: number
    /** Raw IoU of the 24px union masks. */
    readonly collisionIou: number
    /** IoU of the bbox-normalised plane masks (the body silhouette). */
    readonly collisionBody: number
    readonly opticalTolerance: number
  }
  readonly references: readonly string[]
  /** Markdown after the frontmatter, sent to the model verbatim. */
  readonly body: string
  readonly raw: string
  /** sha256 hex of `raw`; keys the draw cache. */
  readonly hash: string
}

export interface ManifestEntry {
  readonly brief: string
  readonly group?: string
  readonly lucide?: string
  readonly approved?: boolean
}
export type Manifest = Readonly<Record<string, ManifestEntry>>

export type Severity = 'error' | 'warn'

export interface Finding {
  readonly icon: string
  readonly rule: string
  readonly severity: Severity
  readonly message: string
  readonly related?: readonly string[]
}

export type Result<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly findings: readonly Finding[] }

export const isTileTone = (tone: ToneStyle): boolean => tone.bg !== undefined

export const hasErrors = (findings: readonly Finding[]): boolean => findings.some((f) => f.severity === 'error')
