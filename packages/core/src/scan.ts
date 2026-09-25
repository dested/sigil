import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { NAME_RE } from './svg'
import type { Manifest, ManifestEntry } from './types'

/**
 * Lucide glyphs that stay stock. The rule: a glyph is *utility* when it is pure
 * UI mechanics (direction, open/close, add/remove, confirm, search, overflow,
 * loading, edit/copy/delete, status badges, drag handles, panel toggles) and
 * names no destination and no object from the product's world. Anything that
 * names a place you navigate to or a thing the user works with (Settings,
 * Calendar, Bell, Users, ShoppingCart, Lock…) is a *tool* icon and goes custom.
 */
export const UTILITY_LUCIDE: ReadonlySet<string> = new Set([
  // direction
  'ChevronDown', 'ChevronUp', 'ChevronLeft', 'ChevronRight',
  'ChevronsDown', 'ChevronsUp', 'ChevronsLeft', 'ChevronsRight', 'ChevronsUpDown', 'ChevronsDownUp',
  'ChevronFirst', 'ChevronLast',
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'ArrowUpDown', 'ArrowDownUp', 'ArrowLeftRight',
  'ArrowUpRight', 'MoveLeft', 'MoveRight', 'CornerDownLeft',
  // open / close / add / remove / confirm
  'X', 'XCircle', 'CircleX', 'Plus', 'PlusCircle', 'CirclePlus', 'Minus',
  'Check', 'CheckCircle', 'CheckCircle2', 'CircleCheck', 'CircleCheckBig',
  // find / overflow / loading
  'Search', 'Menu', 'MoreHorizontal', 'MoreVertical', 'Ellipsis', 'EllipsisVertical',
  'Loader', 'Loader2', 'LoaderCircle', 'RefreshCw', 'RotateCw', 'RotateCcw',
  // generic actions
  'ExternalLink', 'Copy', 'Trash', 'Trash2', 'Delete', 'Pencil', 'PenLine', 'Edit', 'Edit2', 'Edit3', 'SquarePen',
  'Eye', 'EyeOff', 'Filter', 'ListFilter', 'SlidersHorizontal', 'Download', 'Upload', 'Link', 'Link2', 'Unlink',
  'Undo', 'Undo2', 'Redo', 'Redo2', 'ZoomIn', 'ZoomOut', 'Maximize', 'Maximize2', 'Minimize', 'Minimize2',
  'Expand', 'Shrink', 'LogIn', 'LogOut',
  // status badges
  'Info', 'AlertCircle', 'CircleAlert', 'AlertTriangle', 'TriangleAlert', 'HelpCircle', 'CircleHelp',
  'Circle', 'Dot',
  // layout handles
  'GripVertical', 'GripHorizontal', 'Grip', 'PanelLeft', 'PanelRight', 'PanelLeftClose', 'PanelLeftOpen',
])

export interface ScanUsage {
  /** Relative to the scan root, `/`-separated. */
  readonly file: string
  readonly line: number
  /** Canonical export name, alias resolved. */
  readonly lucide: string
  readonly label: string | null
  /** Route/nav area. */
  readonly area: string
}

export interface ScanProposal {
  readonly name: string
  readonly brief: string
  readonly group: string
  readonly lucide: string
  readonly usages: readonly ScanUsage[]
  readonly kind: 'tool' | 'utility'
}

export interface ScanResult {
  readonly root: string
  readonly files: number
  readonly usages: readonly ScanUsage[]
  readonly proposals: readonly ScanProposal[]
  readonly utilities: readonly ScanProposal[]
}

export interface ScanOptions {
  /** Dir prefixes relative to root. Default src, app, apps, packages; the root itself when none exist. */
  readonly include?: readonly string[]
  /** Dir names, or `/`-paths relative to root. */
  readonly ignore?: readonly string[]
}

const DEFAULT_INCLUDE = ['src', 'app', 'apps', 'packages'] as const
const DEFAULT_IGNORE = ['node_modules', 'dist', 'build', '.next', '.sigil', '.git', 'icons/dist'] as const
const EXTENSIONS = ['.tsx', '.jsx', '.ts', '.js'] as const
/** lucide-react exports that are not glyphs. */
const NON_GLYPHS = new Set(['LucideIcon', 'LucideProps', 'createLucideIcon', 'icons', 'Icon', 'default', 'IconNode'])
const LABEL_PROPS = ['label', 'title', 'aria-label', 'name', 'alt'] as const
const LABEL_KEYS = ['label', 'title', 'name', 'text', 'aria-label'] as const
const WINDOW = 3
const BRACE_REACH = 40

// ---------------------------------------------------------------- slugs

export function slugify(label: string): string {
  const slug = label
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return NAME_RE.test(slug) ? slug : ''
}

/** `ShoppingCart` → `Shopping Cart`, `BarChart3` → `Bar Chart 3`. */
const splitCaps = (name: string): string =>
  name
    .replace(/([a-z])([A-Z0-9])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .replace(/([0-9])([A-Za-z])/g, '$1 $2')

/** `HomeIcon` / `LucideHome` → `Home`. */
function canonical(exported: string): string | null {
  if (NON_GLYPHS.has(exported)) return null
  let name = exported
  if (/^Lucide[A-Z0-9]/.test(name)) name = name.slice('Lucide'.length)
  if (name.length > 'Icon'.length && name.endsWith('Icon')) name = name.slice(0, -'Icon'.length)
  return /^[A-Z][A-Za-z0-9]*$/.test(name) ? name : null
}

// ---------------------------------------------------------------- masking

/**
 * Same length as `src`, newlines kept. `comments` blanks comments only;
 * `code` also blanks the contents of string, template and regex literals
 * (the delimiters stay), so identifier and bracket scans see structure only.
 */
function mask(src: string): { comments: string; code: string } {
  const comments = src.split('')
  const code = src.split('')
  const blank = (arr: string[], from: number, to: number): void => {
    for (let k = from; k < to; k++) if (arr[k] !== '\n' && arr[k] !== '\r') arr[k] = ' '
  }
  let lastSignificant = ''
  let i = 0
  const n = src.length
  while (i < n) {
    const c = src[i] ?? ''
    const next = src[i + 1] ?? ''
    if (c === '/' && next === '/') {
      let j = i
      while (j < n && src[j] !== '\n') j++
      blank(comments, i, j)
      blank(code, i, j)
      i = j
      continue
    }
    if (c === '/' && next === '*') {
      const end = src.indexOf('*/', i + 2)
      const j = end === -1 ? n : end + 2
      blank(comments, i, j)
      blank(code, i, j)
      i = j
      continue
    }
    if (c === '"' || c === "'") {
      let j = i + 1
      while (j < n && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1
      blank(code, i + 1, Math.min(j, n))
      i = j + 1
      lastSignificant = c
      continue
    }
    if (c === '`') {
      let j = i + 1
      while (j < n && src[j] !== '`') j += src[j] === '\\' ? 2 : 1
      blank(code, i + 1, Math.min(j, n))
      i = j + 1
      lastSignificant = c
      continue
    }
    if (c === '/' && (lastSignificant === '' || '(,=:[!&|?{};'.includes(lastSignificant))) {
      let j = i + 1
      let inClass = false
      while (j < n && src[j] !== '\n') {
        const d = src[j]
        if (d === '\\') {
          j += 2
          continue
        }
        if (d === '[') inClass = true
        else if (d === ']') inClass = false
        else if (d === '/' && !inClass) break
        j++
      }
      if (j < n && src[j] === '/') {
        blank(code, i + 1, j)
        i = j + 1
        lastSignificant = '/'
        continue
      }
    }
    if (c.trim() !== '') lastSignificant = c
    i++
  }
  return { comments: comments.join(''), code: code.join('') }
}

// ---------------------------------------------------------------- imports

interface Imports {
  /** local identifier → canonical lucide name */
  readonly named: ReadonlyMap<string, string>
  readonly namespaces: readonly string[]
  /** [start, end) spans of the import statements, blanked before usage scans. */
  readonly spans: readonly (readonly [number, number])[]
}

const IMPORT_RE = /\bimport\s+(type\s+)?([^;'"]*?)\s*from\s*(['"])lucide-react\3/g

function findImports(commentless: string): Imports {
  const named = new Map<string, string>()
  const namespaces: string[] = []
  const spans: [number, number][] = []
  for (const m of commentless.matchAll(IMPORT_RE)) {
    spans.push([m.index, m.index + m[0].length])
    if (m[1] !== undefined) continue
    const clause = m[2] ?? ''
    const ns = /\*\s*as\s+([A-Za-z_$][\w$]*)/.exec(clause)
    if (ns?.[1] !== undefined) namespaces.push(ns[1])
    const braces = /\{([^}]*)\}/.exec(clause)
    if (braces?.[1] === undefined) continue
    for (const raw of braces[1].split(',')) {
      const spec = raw.trim()
      if (spec === '' || /^type\s/.test(spec)) continue
      const parts = /^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/.exec(spec)
      if (parts?.[1] === undefined) continue
      const lucide = canonical(parts[1])
      if (lucide !== null) named.set(parts[2] ?? parts[1], lucide)
    }
  }
  return { named, namespaces, spans }
}

// ---------------------------------------------------------------- usages

interface RawUsage {
  readonly pos: number
  readonly lucide: string
  readonly jsx: boolean
}

const isIdent = (c: string | undefined): boolean => c !== undefined && /[\w$]/.test(c)

function prevNonWs(code: string, pos: number): { ch: string; at: number } {
  let k = pos - 1
  while (k >= 0 && /\s/.test(code[k] ?? '')) k--
  return { ch: code[k] ?? '', at: k }
}

function nextNonWs(code: string, pos: number): { ch: string; newline: boolean } {
  let k = pos
  let newline = false
  while (k < code.length && /\s/.test(code[k] ?? '')) {
    if (code[k] === '\n') newline = true
    k++
  }
  return { ch: code[k] ?? '', newline }
}

/** A bare identifier in value position: `icon: Home`, `[Home, X]`, `icon={Home}`, `? Home : X`. */
function isValueRef(code: string, start: number, end: number): boolean {
  const prev = prevNonWs(code, start)
  const next = nextNonWs(code, end)
  let prevOk = ':,([={?&|'.includes(prev.ch) && prev.ch !== ''
  if (prev.ch === '>' && code[prev.at - 1] === '=') prevOk = true // arrow body
  if (!prevOk && /\breturn$/.test(code.slice(Math.max(0, prev.at - 5), prev.at + 1))) prevOk = true
  if (!prevOk) return false
  if (next.ch === ':' && (prev.ch === '{' || prev.ch === ',')) return false // object key
  return next.ch === '' || next.newline || ',})];?:&|'.includes(next.ch)
}

function findUsages(code: string, imports: Imports): RawUsage[] {
  const out: RawUsage[] = []
  for (const [local, lucide] of imports.named) {
    const re = new RegExp(`(?<![\\w$.])${local.replace(/\$/g, '\\$')}(?![\\w$])`, 'g')
    for (const m of code.matchAll(re)) {
      const start = m.index
      const end = start + local.length
      if (code[start - 1] === '<') out.push({ pos: start - 1, lucide, jsx: true })
      else if (code[start - 1] !== '/' && isValueRef(code, start, end)) out.push({ pos: start, lucide, jsx: false })
    }
  }
  for (const ns of imports.namespaces) {
    const re = new RegExp(`(?<![\\w$.])${ns.replace(/\$/g, '\\$')}\\.([A-Za-z_$][\\w$]*)(?![\\w$])`, 'g')
    for (const m of code.matchAll(re)) {
      const lucide = canonical(m[1] ?? '')
      if (lucide === null) continue
      const start = m.index
      if (code[start - 1] === '<') out.push({ pos: start - 1, lucide, jsx: true })
      else if (code[start - 1] !== '/' && isValueRef(code, start, start + m[0].length))
        out.push({ pos: start, lucide, jsx: false })
    }
  }
  return out.sort((a, b) => a.pos - b.pos)
}

// ---------------------------------------------------------------- labels

/** End (exclusive) of the JSX opening tag that starts at `lt`, or -1. */
function tagEnd(code: string, lt: number): number {
  let depth = 0
  for (let k = lt + 1; k < code.length; k++) {
    const c = code[k]
    if (c === '{') depth++
    else if (c === '}') depth--
    else if (c === '>' && depth === 0 && code[k - 1] !== '=') return k + 1
    else if (c === '<' && depth === 0) return -1
  }
  return -1
}

/** Start of the JSX opening tag enclosing `pos` (usage inside an attribute expression), or -1. */
function enclosingTag(code: string, pos: number, floor: number): number {
  let depth = 0
  for (let k = pos - 1; k >= floor; k--) {
    const c = code[k]
    if (c === '}') depth++
    else if (c === '{') depth = Math.max(0, depth - 1)
    else if (depth === 0 && c === '>' && code[k - 1] !== '=') return -1
    else if (depth === 0 && c === '<' && /[A-Za-z]/.test(code[k + 1] ?? '') && !isIdent(code[k - 1])) return k
  }
  return -1
}

const STRING_VALUE = String.raw`(?:"([^"\n]*)"|'([^'\n]*)'|\{\s*(?:"([^"\n]*)"|'([^'\n]*)'|\x60([^\x60$\n]*)\x60)\s*\})`
const PROP_RE = new RegExp(String.raw`(?<![\w-])(${LABEL_PROPS.join('|')})\s*=\s*${STRING_VALUE}`, 'g')
const KEY_RE = new RegExp(
  String.raw`(?<![\w$-])(?:${LABEL_KEYS.map((k) => (k.includes('-') ? `['"]${k}['"]` : `['"]?${k}['"]?`)).join('|')})\s*:\s*(?:"([^"\n]*)"|'([^'\n]*)'|\x60([^\x60$\n]*)\x60)`,
  'g',
)

const firstGroup = (m: RegExpMatchArray, from: number): string | null => {
  for (let g = from; g < m.length; g++) if (m[g] !== undefined) return m[g] ?? null
  return null
}

const clean = (s: string | null): string | null => {
  if (s === null) return null
  const t = s.replace(/\s+/g, ' ').trim()
  return /[A-Za-z]/.test(t) && t.length <= 60 ? t : null
}

function propLabel(src: string, from: number, to: number): string | null {
  const byProp = new Map<string, string>()
  for (const m of src.slice(from, to).matchAll(PROP_RE)) {
    const value = clean(firstGroup(m, 2))
    if (m[1] !== undefined && value !== null && !byProp.has(m[1])) byProp.set(m[1], value)
  }
  for (const p of LABEL_PROPS) {
    const v = byProp.get(p)
    if (v !== undefined) return v
  }
  return null
}

/**
 * Keyed label in the innermost enclosing object literal. The opening brace may
 * sit up to BRACE_REACH lines above; the keys searched are clipped to [lo, hi),
 * the ±WINDOW lines around the usage.
 */
function objectLabel(src: string, code: string, pos: number, floor: number, lo: number, hi: number): string | null {
  let depth = 0
  for (let k = pos - 1; k >= floor; k--) {
    const c = code[k]
    if (c === '}' || c === ')' || c === ']') depth++
    else if (c === '(' || c === '[') depth = Math.max(0, depth - 1)
    else if (c === '{') {
      if (depth > 0) {
        depth--
        continue
      }
      let d = 0
      let close = hi
      for (let j = k; j < hi; j++) {
        if (code[j] === '{') d++
        else if (code[j] === '}' && --d === 0) {
          close = j + 1
          break
        }
      }
      const span = src.slice(Math.max(k, lo), Math.min(close, hi))
      for (const m of span.matchAll(KEY_RE)) {
        const v = clean(firstGroup(m, 1))
        if (v !== null) return v
      }
    }
  }
  return null
}

/** First visible text in one line of JSX; undefined when the line has none. */
function lineText(line: string): string | null | undefined {
  for (const t of line.split(/<[^>]*>/).map((s) => s.trim())) {
    if (t === '') continue
    if (/[{}=;()<>]/.test(t)) return null
    return clean(t)
  }
  return undefined
}

/**
 * Visible text after the tag: `<Home /> Roster`, `<Home /><span>Roster</span>`,
 * or the next line's text when the tag ends its line.
 */
function textChild(src: string, from: number): string | null {
  const eol = src.indexOf('\n', from)
  const same = lineText(src.slice(from, eol === -1 ? src.length : eol))
  if (same !== undefined || eol === -1) return same ?? null
  const eol2 = src.indexOf('\n', eol + 1)
  return lineText(src.slice(eol + 1, eol2 === -1 ? src.length : eol2)) ?? null
}

function labelFor(src: string, code: string, u: RawUsage, lineStarts: readonly number[], line: number): string | null {
  const lo = lineStarts[Math.max(0, line - 1 - WINDOW)] ?? 0
  const hi = lineStarts[line + WINDOW] ?? src.length
  const tagStart = u.jsx ? u.pos : enclosingTag(code, u.pos, lo)
  const end = tagStart === -1 ? -1 : tagEnd(code, tagStart)
  if (tagStart !== -1 && end !== -1) {
    const byProp = propLabel(src, tagStart, end)
    if (byProp !== null) return byProp
  }
  const floor = lineStarts[Math.max(0, line - 1 - BRACE_REACH)] ?? 0
  const byObject = objectLabel(src, code, u.pos, floor, lo, hi)
  if (byObject !== null) return byObject
  if (end !== -1) return textChild(src, end)
  return null
}

// ---------------------------------------------------------------- areas

const stripExt = (f: string): string => f.replace(/\.[^.]+$/, '')
const isRouteNoise = (s: string): boolean =>
  s === '' || s === 'index' || s === 'route' || s === 'page' || s === 'layout' || /^[_$[(]/.test(s)

function areaFor(rel: string, includeRoot: string): string {
  const segs = rel.split('/')
  const marker = segs.findIndex((s, i) => i < segs.length - 1 && (s === 'routes' || s === 'pages' || s === 'app'))
  if (marker !== -1) {
    const after = segs.slice(marker + 1)
    for (let i = 0; i < after.length; i++) {
      const seg = after[i] ?? ''
      const isFile = i === after.length - 1
      if (!isFile) {
        if (!isRouteNoise(seg)) return seg
        continue
      }
      const first = stripExt(seg)
        .split('.')
        .find((p) => !isRouteNoise(p))
      return first ?? 'root'
    }
    return 'root'
  }
  let under = includeRoot === '' ? segs : segs.slice(includeRoot.split('/').length)
  if ((includeRoot === 'apps' || includeRoot === 'packages') && under.length > 1) {
    under = under.slice(1)
    if (under[0] === 'src' && under.length > 1) under = under.slice(1)
  }
  if (under.length > 1) return under[0] ?? 'root'
  return stripExt(under[0] ?? 'root')
}

// ---------------------------------------------------------------- walk

function walk(root: string, dir: string, ignore: readonly string[], out: string[]): void {
  let entries: string[]
  try {
    entries = readdirSync(dir).sort()
  } catch {
    return
  }
  for (const name of entries) {
    const abs = join(dir, name)
    const rel = relative(root, abs).split(sep).join('/')
    let isDir: boolean
    try {
      isDir = statSync(abs).isDirectory()
    } catch {
      continue
    }
    if (isDir) {
      if (ignore.some((ig) => (ig.includes('/') ? rel === ig || rel.startsWith(`${ig}/`) : name === ig))) continue
      walk(root, abs, ignore, out)
    } else if (EXTENSIONS.some((e) => name.endsWith(e)) && !name.endsWith('.d.ts')) {
      out.push(rel)
    }
  }
}

function lineStartsOf(src: string): number[] {
  const starts = [0]
  for (let k = 0; k < src.length; k++) if (src[k] === '\n') starts.push(k + 1)
  return starts
}

function lineAt(starts: readonly number[], pos: number): number {
  let lo = 0
  let hi = starts.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if ((starts[mid] ?? 0) <= pos) lo = mid
    else hi = mid - 1
  }
  return lo + 1
}

/** All lucide usages in one file's source. `rel` is only used for the area. */
export function scanSource(src: string, rel: string, includeRoot = ''): ScanUsage[] {
  if (!src.includes('lucide-react')) return []
  const { comments, code: masked } = mask(src)
  const imports = findImports(comments)
  if (imports.named.size === 0 && imports.namespaces.length === 0) return []
  const chars = masked.split('')
  for (const [a, b] of imports.spans) for (let k = a; k < b; k++) if (chars[k] !== '\n') chars[k] = ' '
  const code = chars.join('')
  const starts = lineStartsOf(src)
  const area = areaFor(rel, includeRoot)
  return findUsages(code, imports).map((u) => {
    const line = lineAt(starts, u.pos)
    return { file: rel, line, lucide: u.lucide, label: labelFor(src, code, u, starts, line), area }
  })
}

// ---------------------------------------------------------------- proposals

/** Most frequent value; ties go to the shorter, then the alphabetically first. */
function mostCommon(values: readonly string[]): string | null {
  const counts = new Map<string, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  let best: string | null = null
  let bestN = 0
  const ordered = [...counts].sort((a, b) => a[0].length - b[0].length || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  for (const [v, count] of ordered) {
    if (count > bestN) {
      best = v
      bestN = count
    }
  }
  return best
}

function propose(usages: readonly ScanUsage[]): ScanProposal[] {
  const byLucide = new Map<string, ScanUsage[]>()
  for (const u of usages) {
    const list = byLucide.get(u.lucide)
    if (list === undefined) byLucide.set(u.lucide, [u])
    else list.push(u)
  }
  const drafts = [...byLucide].map(([lucide, list]) => {
    const labels = list.map((u) => u.label).filter((l): l is string => l !== null)
    // Nav-style labels (up to 3 words) name the tool; sentences are the fallback.
    const short = labels.filter((l) => l.split(' ').length <= 3)
    const label = mostCommon(short.length > 0 ? short : labels)
    const fromLabel = label === null ? '' : slugify(label)
    const base = fromLabel !== '' ? fromLabel : slugify(splitCaps(lucide)) || 'icon'
    const brief =
      label !== null && fromLabel !== ''
        ? `${label}: replace the Lucide "${lucide}" glyph — draw the real object`
        : `the Lucide "${lucide}" glyph — draw the real object`
    const kind: ScanProposal['kind'] = UTILITY_LUCIDE.has(lucide) ? 'utility' : 'tool'
    return { base, brief, group: mostCommon(list.map((u) => u.area)) ?? 'root', lucide, usages: list, kind }
  })
  drafts.sort(
    (a, b) =>
      b.usages.length - a.usages.length ||
      (a.base < b.base ? -1 : a.base > b.base ? 1 : 0) ||
      (a.lucide < b.lucide ? -1 : a.lucide > b.lucide ? 1 : 0),
  )
  const taken = new Set<string>()
  return drafts.map(({ base, ...rest }) => {
    let name = base
    for (let k = 2; taken.has(name); k++) name = `${base}-${k}`
    taken.add(name)
    return { name, ...rest }
  })
}

export function scanProject(root: string, opts: ScanOptions = {}): ScanResult {
  const include = opts.include ?? DEFAULT_INCLUDE
  const ignore = opts.ignore ?? DEFAULT_IGNORE
  const present = include.map((p) => p.replace(/^\.?\/+|\/+$/g, '')).filter((p) => p !== '' && existsSync(join(root, p)))
  const roots = present.length > 0 ? present : ['']
  const files: { rel: string; includeRoot: string }[] = []
  const seen = new Set<string>()
  for (const inc of roots) {
    const found: string[] = []
    walk(root, inc === '' ? root : join(root, inc), ignore, found)
    for (const rel of found) {
      if (seen.has(rel)) continue
      seen.add(rel)
      files.push({ rel, includeRoot: inc })
    }
  }
  const usages: ScanUsage[] = []
  for (const { rel, includeRoot } of files) {
    let src: string
    try {
      src = readFileSync(join(root, rel), 'utf8')
    } catch {
      continue
    }
    usages.push(...scanSource(src, rel, includeRoot))
  }
  const all = propose(usages)
  return {
    root,
    files: files.length,
    usages,
    proposals: all.filter((p) => p.kind === 'tool'),
    utilities: all.filter((p) => p.kind === 'utility'),
  }
}

/**
 * Upserts proposals into a manifest. Never overwrites an existing brief; fills
 * `lucide` and `group` only when missing. A proposal whose lucide glyph is
 * already claimed by another entry (the dev renamed it) is skipped.
 */
export function proposalsToManifest(proposals: readonly ScanProposal[], existing: Manifest): Manifest {
  const out: Record<string, ManifestEntry> = { ...existing }
  const claimed = new Set<string>()
  for (const e of Object.values(existing)) if (e.lucide !== undefined) claimed.add(e.lucide)
  for (const p of proposals) {
    const current = out[p.name]
    if (current === undefined) {
      if (claimed.has(p.lucide)) continue
      out[p.name] = { brief: p.brief, group: p.group, lucide: p.lucide }
    } else {
      out[p.name] = {
        ...current,
        ...(current.lucide === undefined ? { lucide: p.lucide } : {}),
        ...(current.group === undefined ? { group: p.group } : {}),
      }
    }
    claimed.add(p.lucide)
  }
  return out
}
