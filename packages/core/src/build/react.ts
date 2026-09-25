import { fmt } from '../render'
import { isTileTone, type Icon, type IconStyle, type Layer, type Shape } from '../types'
import type { BuildFile } from './sprite'

/** `point-of-sale` → `PointOfSale`; a leading digit gets an `Icon` prefix. */
export function pascal(name: string): string {
  const p = name
    .split('-')
    .filter((s) => s.length > 0)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('')
  return /^[0-9]/.test(p) ? `Icon${p}` : p
}

// Names the generated index already binds; an icon whose PascalCase name hits one gets an `Icon` suffix.
const RESERVED = new Set([
  'Icon',
  'ICONS',
  'IconName',
  'IconProps',
  'IconTone',
  'Glyph',
  'GlyphSvg',
  'Layer',
  'Shape',
  'ReactElement',
])

export function componentName(name: string): string {
  const p = pascal(name)
  return RESERVED.has(p) ? `${p}Icon` : p
}

const str = (s: string): string => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`

function shapeLiteral(s: Shape): string {
  switch (s.kind) {
    case 'path':
      return `{ kind: 'path', d: ${str(s.d)} }`
    case 'circle':
      return `{ kind: 'circle', cx: ${fmt(s.cx)}, cy: ${fmt(s.cy)}, r: ${fmt(s.r)} }`
    case 'rect':
      return `{ kind: 'rect', x: ${fmt(s.x)}, y: ${fmt(s.y)}, width: ${fmt(s.width)}, height: ${fmt(s.height)}, rx: ${fmt(s.rx)} }`
    case 'line':
      return `{ kind: 'line', x1: ${fmt(s.x1)}, y1: ${fmt(s.y1)}, x2: ${fmt(s.x2)}, y2: ${fmt(s.y2)} }`
    case 'polyline':
      return `{ kind: 'polyline', points: [${s.points.map(([x, y]) => `[${fmt(x)}, ${fmt(y)}]`).join(', ')}] }`
  }
}

function layerLiteral(l: Layer): string {
  return `  { role: '${l.role}', shapes: [\n${l.shapes.map((s) => `    ${shapeLiteral(s)},`).join('\n')}\n  ] },`
}

function iconFile(icon: Icon): string {
  const comp = componentName(icon.name)
  const brief = icon.brief.trim() === '' ? icon.name : icon.brief.trim()
  const doc = brief.replace(/\s+/g, ' ').replace(/\*\//g, '*\\/')
  return (
    `import { createIcon } from '../glyph'\n\n` +
    `/** ${doc} */\n` +
    `export const ${comp} = createIcon(${str(icon.name)}, [\n${icon.layers.map(layerLiteral).join('\n')}\n] as const)\n`
  )
}

const GLYPH_BODY = `export interface IconProps {
  readonly tone?: IconTone
  /** Outer size in px: the tile for tile tones, the drawing otherwise. */
  readonly size?: number
  readonly className?: string
  readonly style?: CSSProperties
  readonly title?: string
}

function ShapeEl({ shape }: { readonly shape: Shape }): ReactElement {
  switch (shape.kind) {
    case 'path':
      return <path d={shape.d} />
    case 'circle':
      return <circle cx={shape.cx} cy={shape.cy} r={shape.r} />
    case 'rect':
      return <rect x={shape.x} y={shape.y} width={shape.width} height={shape.height} rx={shape.rx === 0 ? undefined : shape.rx} />
    case 'line':
      return <line x1={shape.x1} y1={shape.y1} x2={shape.x2} y2={shape.y2} />
    case 'polyline':
      return <polyline points={shape.points.map(([x, y]) => \`\${x},\${y}\`).join(' ')} />
  }
}

export function GlyphSvg({
  glyph,
  size,
  className,
  style,
  title,
}: {
  readonly glyph: Glyph
  readonly size: number
  readonly className?: string | undefined
  readonly style?: CSSProperties | undefined
  readonly title?: string | undefined
}): ReactElement {
  return (
    <svg
      viewBox={\`0 0 \${GRID} \${GRID}\`}
      width={size}
      height={size}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      className={['sg-svg', className].filter(Boolean).join(' ')}
      style={style}
    >
      {title ? <title>{title}</title> : null}
      {glyph.map((layer, i) => (
        <g key={i} className={\`sg-\${layer.role}\`}>
          {layer.shapes.map((shape, j) => (
            <ShapeEl key={j} shape={shape} />
          ))}
        </g>
      ))}
    </svg>
  )
}

function displayNameOf(name: string): string {
  const p = name
    .split('-')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('')
  return /^[0-9]/.test(p) ? \`Icon\${p}\` : p
}
`

function createIconSource(defaultTone: string): string {
  return `
export function createIcon(name: string, glyph: Glyph): (props: IconProps) => ReactElement {
  function SigilIcon({ tone = ${str(defaultTone)}, size, className, style, title }: IconProps): ReactElement {
    const extra = className ? \` \${className}\` : ''
    if (TILE_TONES.has(tone)) {
      const outer = size ?? 44
      return (
        <span className={\`sg-tile-\${tone}\${extra}\`} style={{ width: outer, height: outer, ...style }}>
          <GlyphSvg glyph={glyph} size={Math.round(outer * (TILE_SCALE[tone] ?? 0.6))} title={title} />
        </span>
      )
    }
    return <GlyphSvg glyph={glyph} size={size ?? 20} className={\`sg-tone-\${tone}\${extra}\`} style={style} title={title} />
  }
  SigilIcon.displayName = displayNameOf(name)
  return SigilIcon
}
`
}

function glyphFile(style: IconStyle): string {
  const names = Object.keys(style.tones)
  const first = names[0]
  if (first === undefined) throw new Error('icon.md defines no tones')
  const tiles = names.filter((n) => {
    const t = style.tones[n]
    return t !== undefined && isTileTone(t)
  })
  const scales = tiles.map((n) => `${str(n)}: ${fmt(style.tones[n]?.scale ?? 0.6)}`).join(', ')
  const head = [
    `// Generated by sigil — do not edit. Tones: ${names.join(', ')}. Import icons.css once.`,
    `import type { CSSProperties, ReactElement } from 'react'`,
    ``,
    `export type Shape =`,
    `  | { readonly kind: 'path'; readonly d: string }`,
    `  | { readonly kind: 'circle'; readonly cx: number; readonly cy: number; readonly r: number }`,
    `  | { readonly kind: 'rect'; readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly rx: number }`,
    `  | { readonly kind: 'line'; readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number }`,
    `  | { readonly kind: 'polyline'; readonly points: readonly (readonly [number, number])[] }`,
    `export type Role = 'plane' | 'line' | 'dot' | 'accent'`,
    `export interface Layer { readonly role: Role; readonly shapes: readonly Shape[] }`,
    `export type Glyph = readonly Layer[]`,
    `export type IconTone = ${names.map(str).join(' | ')}`,
    `export const TILE_TONES: ReadonlySet<string> = new Set<string>([${tiles.map(str).join(', ')}])`,
    `export const TILE_SCALE: Readonly<Record<string, number>> = { ${scales} }`,
    `export const GRID = ${fmt(style.grid)}`,
    ``,
    ``,
  ].join('\n')
  return head + GLYPH_BODY + createIconSource(first)
}

function indexFile(icons: readonly Icon[]): string {
  const comps = icons.map((i) => ({ name: i.name, comp: componentName(i.name) }))
  return (
    `// Generated by sigil — do not edit.\n` +
    `import type { ReactElement } from 'react'\n` +
    `import type { IconProps } from './glyph'\n` +
    comps.map((c) => `import { ${c.comp} } from './icons/${c.comp}'\n`).join('') +
    `\n` +
    `export type { IconProps, IconTone, Glyph, Layer, Shape } from './glyph'\n` +
    `export { GlyphSvg } from './glyph'\n` +
    comps.map((c) => `export { ${c.comp} } from './icons/${c.comp}'\n`).join('') +
    `\n` +
    `export const ICONS = {\n${comps.map((c) => `  ${str(c.name)}: ${c.comp},\n`).join('')}} as const\n` +
    `export type IconName = keyof typeof ICONS\n\n` +
    `export function Icon({ name, ...props }: IconProps & { readonly name: IconName }): ReactElement {\n` +
    `  const C = ICONS[name]\n` +
    `  return <C {...props} />\n` +
    `}\n`
  )
}

/** Typed React output: shared runtime in glyph.tsx, one module per icon, and a name-keyed index. */
export function buildReact(icons: readonly Icon[], style: IconStyle): BuildFile[] {
  const seen = new Map<string, string>()
  for (const icon of icons) {
    // Case-insensitive filesystems (Windows, macOS) would let `AB.tsx` overwrite `Ab.tsx`.
    const key = componentName(icon.name).toLowerCase()
    const prev = seen.get(key)
    if (prev !== undefined) throw new Error(`icons "${prev}" and "${icon.name}" map to the same component file`)
    seen.set(key, icon.name)
  }
  return [
    { path: 'react/glyph.tsx', content: glyphFile(style) },
    ...icons.map((icon) => ({ path: `react/icons/${componentName(icon.name)}.tsx`, content: iconFile(icon) })),
    { path: 'react/index.tsx', content: indexFile(icons) },
  ]
}
