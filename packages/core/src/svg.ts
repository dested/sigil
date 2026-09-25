import { ROLES } from './types'
import type { Finding, Icon, Layer, Result, Role, Shape } from './types'

export const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

const SVG_NS = 'http://www.w3.org/2000/svg'

const XML_ENTITIES: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

export function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function xmlUnescape(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi, (whole, ent: string) => {
    if (ent.startsWith('#')) {
      const code = ent[1] === 'x' || ent[1] === 'X' ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10)
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole
    }
    return XML_ENTITIES[ent.toLowerCase()] ?? whole
  })
}

const SHAPE_ATTRS = {
  path: ['d'],
  circle: ['cx', 'cy', 'r'],
  rect: ['x', 'y', 'width', 'height', 'rx'],
  line: ['x1', 'y1', 'x2', 'y2'],
  polyline: ['points'],
} as const satisfies Record<Shape['kind'], readonly string[]>

type ShapeKind = keyof typeof SHAPE_ATTRS
const SHAPE_KINDS: readonly ShapeKind[] = ['path', 'circle', 'rect', 'line', 'polyline']
const isShapeKind = (s: string): s is ShapeKind => SHAPE_KINDS.some((k) => k === s)
const isRole = (s: string): s is Role => ROLES.some((r) => r === s)

const SVG_ATTRS: readonly string[] = ['xmlns', 'viewBox', 'data-sigil', 'data-brief', 'width', 'height']
const G_ATTRS: readonly string[] = ['data-role']

const NUMBER_RE = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i

type Token =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'open'; readonly name: string; readonly attrs: ReadonlyMap<string, string>; readonly selfClosing: boolean }
  | { readonly type: 'close'; readonly name: string }

const TAG_RE = /^<(\/)?([A-Za-z_][\w:.-]*)([\s\S]*?)(\/)?>$/
const ATTR_RE = /\s*([A-Za-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/y

function tokenize(source: string, fail: (msg: string) => void): Token[] {
  const cleaned = source.replace(/<\?xml[\s\S]*?\?>/g, '').replace(/<!--[\s\S]*?-->/g, '')
  const tokens: Token[] = []
  let pos = 0
  while (pos < cleaned.length) {
    const lt = cleaned.indexOf('<', pos)
    const textEnd = lt === -1 ? cleaned.length : lt
    if (textEnd > pos) tokens.push({ type: 'text', text: cleaned.slice(pos, textEnd) })
    if (lt === -1) break
    const gt = cleaned.indexOf('>', lt)
    if (gt === -1) {
      fail(`unclosed tag at offset ${lt}`)
      break
    }
    const raw = cleaned.slice(lt, gt + 1)
    pos = gt + 1
    const m = TAG_RE.exec(raw)
    const name = m?.[2]
    if (m === null || name === undefined) {
      fail(`malformed tag ${raw}`)
      continue
    }
    if (m[1] !== undefined) {
      if ((m[3] ?? '').trim() !== '' || m[4] !== undefined) fail(`malformed closing tag ${raw}`)
      tokens.push({ type: 'close', name })
      continue
    }
    const attrText = m[3] ?? ''
    const attrs = new Map<string, string>()
    ATTR_RE.lastIndex = 0
    let at = 0
    while (at < attrText.length) {
      if (attrText.slice(at).trim() === '') break
      ATTR_RE.lastIndex = at
      const a = ATTR_RE.exec(attrText)
      const key = a?.[1]
      if (a === null || key === undefined) {
        fail(`malformed attributes in <${name}>`)
        break
      }
      if (attrs.has(key)) fail(`<${name}> repeats attribute "${key}"`)
      attrs.set(key, xmlUnescape(a[2] ?? a[3] ?? ''))
      at = ATTR_RE.lastIndex
    }
    tokens.push({ type: 'open', name, attrs, selfClosing: m[4] !== undefined })
  }
  return tokens
}

function readNumber(el: string, attrs: ReadonlyMap<string, string>, key: string, report: (rule: string, msg: string) => void): number | null {
  const v = attrs.get(key)
  if (v === undefined) {
    report('schema.attr', `${el} is missing "${key}"`)
    return null
  }
  const t = v.trim()
  const n = Number(t)
  if (!NUMBER_RE.test(t) || !Number.isFinite(n)) {
    report('schema.attr', `${el} attribute "${key}" is not a finite number: "${v}"`)
    return null
  }
  return n
}

function readShape(kind: ShapeKind, attrs: ReadonlyMap<string, string>, report: (rule: string, msg: string) => void): Shape | null {
  const allowed: readonly string[] = SHAPE_ATTRS[kind]
  for (const key of attrs.keys()) {
    if (!allowed.includes(key)) report('schema.attr', `${kind} has forbidden attribute "${key}"`)
  }
  const num = (key: string): number | null => readNumber(kind, attrs, key, report)
  switch (kind) {
    case 'path': {
      const d = attrs.get('d')
      if (d === undefined || d.trim() === '') {
        report('schema.attr', 'path is missing "d"')
        return null
      }
      return { kind, d }
    }
    case 'circle': {
      const cx = num('cx')
      const cy = num('cy')
      const r = num('r')
      return cx === null || cy === null || r === null ? null : { kind, cx, cy, r }
    }
    case 'rect': {
      const x = num('x')
      const y = num('y')
      const width = num('width')
      const height = num('height')
      const rx = attrs.has('rx') ? num('rx') : 0
      return x === null || y === null || width === null || height === null || rx === null
        ? null
        : { kind, x, y, width, height, rx }
    }
    case 'line': {
      const x1 = num('x1')
      const y1 = num('y1')
      const x2 = num('x2')
      const y2 = num('y2')
      return x1 === null || y1 === null || x2 === null || y2 === null ? null : { kind, x1, y1, x2, y2 }
    }
    case 'polyline': {
      const raw = attrs.get('points')
      if (raw === undefined) {
        report('schema.attr', 'polyline is missing "points"')
        return null
      }
      const parts = raw.split(/[\s,]+/).filter((p) => p.length > 0)
      const nums = parts.map((p) => (NUMBER_RE.test(p) ? Number(p) : Number.NaN))
      if (nums.some((n) => !Number.isFinite(n)) || nums.length < 4 || nums.length % 2 !== 0) {
        report('schema.attr', `polyline "points" must be an even count of at least 4 finite numbers: "${raw}"`)
        return null
      }
      const points: (readonly [number, number])[] = []
      for (let i = 0; i + 1 < nums.length; i += 2) {
        const px = nums[i]
        const py = nums[i + 1]
        if (px !== undefined && py !== undefined) points.push([px, py])
      }
      return { kind, points }
    }
  }
}

export function parseIconSvg(source: string, name: string): Result<Icon> {
  const findings: Finding[] = []
  const report = (rule: string, message: string): void => {
    findings.push({ icon: name, rule, severity: 'error', message })
  }
  if (!NAME_RE.test(name)) report('schema.name', `icon name "${name}" must be kebab-case (${NAME_RE.source})`)

  const tokens = tokenize(source, (msg) => report('schema.parse', msg))
  let i = 0
  const skipWhitespace = (): void => {
    for (;;) {
      const t = tokens[i]
      if (t === undefined || t.type !== 'text') return
      if (t.text.trim() !== '') report('schema.parse', `unexpected text "${t.text.trim().slice(0, 40)}"`)
      i++
    }
  }
  /** Skips an unexpected open element and, when not self-closing, everything up to its matching close. */
  const skipElement = (t: Token & { type: 'open' }): void => {
    i++
    if (t.selfClosing) return
    let depth = 1
    while (i < tokens.length && depth > 0) {
      const u = tokens[i]
      if (u?.type === 'open' && u.name === t.name && !u.selfClosing) depth++
      if (u?.type === 'close' && u.name === t.name) depth--
      i++
    }
    if (depth > 0) report('schema.parse', `unclosed <${t.name}>`)
  }

  skipWhitespace()
  const root = tokens[i]
  if (root === undefined || root.type !== 'open' || root.name !== 'svg' || root.selfClosing) {
    report('schema.parse', 'expected an <svg> root element')
    return { ok: false, findings }
  }
  i++

  for (const key of root.attrs.keys()) {
    if (!SVG_ATTRS.includes(key)) report('schema.attr', `svg has forbidden attribute "${key}"`)
  }
  let grid = 0
  const viewBox = root.attrs.get('viewBox')
  const vb = viewBox === undefined ? [] : viewBox.trim().split(/[\s,]+/)
  const [v0, v1, v2, v3] = vb.map((p) => (NUMBER_RE.test(p) ? Number(p) : Number.NaN))
  if (vb.length === 4 && v0 === 0 && v1 === 0 && v2 !== undefined && v2 > 0 && Number.isFinite(v2) && v2 === v3) {
    grid = v2
  } else {
    report('schema.viewbox', viewBox === undefined ? 'svg is missing viewBox' : `viewBox "${viewBox}" must be "0 0 N N"`)
  }
  const brief = root.attrs.get('data-brief') ?? ''

  const layers: Layer[] = []
  let closed = false
  for (;;) {
    skipWhitespace()
    const t = tokens[i]
    if (t === undefined) break
    if (t.type === 'close') {
      i++
      if (t.name === 'svg') {
        closed = true
        break
      }
      report('schema.parse', `unexpected </${t.name}>`)
      continue
    }
    if (t.type !== 'open') continue
    if (t.name !== 'g') {
      report(
        isShapeKind(t.name) ? 'schema.parse' : 'schema.element',
        isShapeKind(t.name) ? `<${t.name}> must be inside a <g data-role> group` : `unexpected element <${t.name}>`,
      )
      skipElement(t)
      continue
    }
    i++
    for (const key of t.attrs.keys()) {
      if (!G_ATTRS.includes(key)) report('schema.attr', `g has forbidden attribute "${key}"`)
    }
    const roleAttr = t.attrs.get('data-role')
    let role: Role | null = null
    if (roleAttr === undefined) report('schema.attr', 'g is missing "data-role"')
    else if (isRole(roleAttr)) role = roleAttr
    else report('schema.role', `unknown role "${roleAttr}"`)

    const shapes: Shape[] = []
    let shapeCount = 0
    let groupClosed = t.selfClosing
    while (!groupClosed) {
      skipWhitespace()
      const s = tokens[i]
      if (s === undefined) break
      if (s.type === 'close') {
        i++
        if (s.name === 'g') groupClosed = true
        else report('schema.parse', `unexpected </${s.name}> inside <g>`)
        continue
      }
      if (s.type !== 'open') continue
      if (!isShapeKind(s.name)) {
        report('schema.element', `unexpected element <${s.name}>`)
        skipElement(s)
        continue
      }
      if (!s.selfClosing) {
        report('schema.parse', `<${s.name}> must be self-closing`)
        skipElement(s)
        continue
      }
      i++
      shapeCount++
      const shape = readShape(s.name, s.attrs, report)
      if (shape !== null) shapes.push(shape)
    }
    if (!groupClosed) report('schema.parse', 'unclosed <g>')
    if (shapeCount === 0) report('schema.empty', `group <g data-role="${roleAttr ?? ''}"> is empty`)
    if (role !== null) layers.push({ role, shapes })
    if (!groupClosed) break
  }
  if (!closed) report('schema.parse', 'unclosed <svg>')
  skipWhitespace()
  if (i < tokens.length) report('schema.parse', 'unexpected content after </svg>')
  if (layers.length === 0 && !findings.some((f) => f.rule === 'schema.empty')) {
    report('schema.empty', 'icon has no <g data-role> groups')
  }

  if (findings.length > 0) return { ok: false, findings }
  return { ok: true, value: { name, brief, grid, layers } }
}

const fmt = (n: number): string => Number(n.toFixed(3)).toString()

function serializeShape(s: Shape): string {
  switch (s.kind) {
    case 'path':
      return `<path d="${xmlEscape(s.d)}"/>`
    case 'circle':
      return `<circle cx="${fmt(s.cx)}" cy="${fmt(s.cy)}" r="${fmt(s.r)}"/>`
    case 'rect': {
      const rx = s.rx !== 0 ? ` rx="${fmt(s.rx)}"` : ''
      return `<rect x="${fmt(s.x)}" y="${fmt(s.y)}" width="${fmt(s.width)}" height="${fmt(s.height)}"${rx}/>`
    }
    case 'line':
      return `<line x1="${fmt(s.x1)}" y1="${fmt(s.y1)}" x2="${fmt(s.x2)}" y2="${fmt(s.y2)}"/>`
    case 'polyline':
      return `<polyline points="${s.points.map(([x, y]) => `${fmt(x)},${fmt(y)}`).join(' ')}"/>`
  }
}

export function serializeIcon(icon: Icon): string {
  const g = fmt(icon.grid)
  const brief = icon.brief !== '' ? ` data-brief="${xmlEscape(icon.brief)}"` : ''
  let out = `<svg xmlns="${SVG_NS}" viewBox="0 0 ${g} ${g}" data-sigil="1"${brief}>\n`
  for (const layer of icon.layers) {
    out += `  <g data-role="${layer.role}">${layer.shapes.map(serializeShape).join('')}</g>\n`
  }
  return `${out}</svg>\n`
}
