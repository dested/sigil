import { parseIconSvg } from './svg'
import type { Finding, Icon, IconStyle, Role, Shape } from './types'

const onHalfGrid = (v: number): boolean => Math.abs(v * 2 - Math.round(v * 2)) < 1e-6

const PATH_TOKEN_RE = /([MmLlHhVvCcSsQqTtAaZz])|([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)/gi

/** Numbers that follow absolute M/L/H/V commands (including implicit repeats); curves, arcs and relative commands are skipped. */
function pathGridNumbers(d: string): number[] {
  const out: number[] = []
  let checked = false
  for (const m of d.matchAll(PATH_TOKEN_RE)) {
    const cmd = m[1]
    if (cmd !== undefined) {
      checked = cmd === 'M' || cmd === 'L' || cmd === 'H' || cmd === 'V'
      continue
    }
    if (checked && m[2] !== undefined) out.push(Number(m[2]))
  }
  return out
}

function gridNumbers(s: Shape): number[] {
  switch (s.kind) {
    case 'path':
      return pathGridNumbers(s.d)
    case 'circle':
      return [s.cx, s.cy]
    case 'rect':
      return [s.x, s.y, s.width, s.height]
    case 'line':
      return [s.x1, s.y1, s.x2, s.y2]
    case 'polyline':
      return s.points.flatMap(([x, y]) => [x, y])
  }
}

export function lintIcon(icon: Icon, style: IconStyle): Finding[] {
  const findings: Finding[] = []
  const add = (rule: string, severity: Finding['severity'], message: string): void => {
    findings.push({ icon: icon.name, rule, severity, message })
  }

  const badRoles = new Set<Role>()
  for (const layer of icon.layers) {
    if (!style.roles.includes(layer.role) && !badRoles.has(layer.role)) {
      badRoles.add(layer.role)
      add('schema.role', 'error', `role "${layer.role}" is not enabled in icon.md roles [${style.roles.join(', ')}]`)
    }
  }

  if (icon.grid !== style.grid) {
    add('schema.viewbox', 'error', `viewBox is 0 0 ${icon.grid} ${icon.grid} but icon.md grid is ${style.grid}`)
  }

  if (icon.layers.length === 0) add('schema.empty', 'error', 'icon has no layers')
  for (const layer of icon.layers) {
    if (layer.shapes.length === 0) add('schema.empty', 'error', `a "${layer.role}" group is empty`)
  }

  for (const layer of icon.layers) {
    for (const shape of layer.shapes) {
      const off = gridNumbers(shape).find((v) => !onHalfGrid(v))
      if (off !== undefined) add('grid.half', 'warn', `${shape.kind} coordinate ${off} is off the half-grid`)
    }
  }

  const strokeShapes = icon.layers
    .filter((l) => l.role === 'line' || l.role === 'dot')
    .reduce((n, l) => n + l.shapes.length, 0)
  const marks = Math.max(0, strokeShapes - 1)
  const [lo, hi] = style.detailBudget.innerMarks
  if (marks < lo || marks > hi) add('budget.marks', 'warn', `${marks} inner marks, budget is ${lo}–${hi}`)

  return findings
}

export function lintIconSource(source: string, name: string, style: IconStyle): { icon: Icon | null; findings: Finding[] } {
  const parsed = parseIconSvg(source, name)
  if (!parsed.ok) return { icon: null, findings: [...parsed.findings] }
  return { icon: parsed.value, findings: lintIcon(parsed.value, style) }
}
