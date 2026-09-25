import { existsSync, mkdirSync, readdirSync, rmdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { buildCss } from './build/css'
import { buildReact } from './build/react'
import { buildSheetHtml } from './build/sheet'
import { buildFlat, buildSprite, type BuildFile } from './build/sprite'
import { loadIcons, type Project } from './project'
import { renderSheet } from './render'
import type { Finding } from './types'

export { buildCss } from './build/css'
export { buildReact, componentName, pascal } from './build/react'
export { buildSheetHtml } from './build/sheet'
export { buildFlat, buildSprite, type BuildFile } from './build/sprite'

export interface BuildResult {
  readonly distDir: string
  readonly files: readonly string[]
  readonly iconCount: number
  readonly findings: readonly Finding[]
}

const toPosix = (p: string): string => p.split(sep).join('/')

function walk(dir: string): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else out.push(p)
  }
  return out
}

/** Deletes files under `sub` that this build does not produce, then any directories left empty. Nothing outside `sub` is touched. */
function pruneStale(distDir: string, sub: string, keep: ReadonlySet<string>): void {
  const root = join(distDir, sub)
  for (const file of walk(root)) {
    if (!keep.has(toPosix(relative(distDir, file)))) rmSync(file)
  }
  const removeEmpty = (dir: string): void => {
    if (!existsSync(dir)) return
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry)
      if (statSync(p).isDirectory()) removeEmpty(p)
    }
    if (dir !== root && readdirSync(dir).length === 0) rmdirSync(dir)
  }
  removeEmpty(root)
}

export function buildProject(project: Project, opts: { readonly distDir?: string } = {}): BuildResult {
  const style = project.style
  if (style === null) throw new Error('icon.md missing or invalid')
  const distDir = resolve(opts.distDir ?? project.distDir)
  const { icons, findings } = loadIcons(project)

  const outputs: BuildFile[] = [
    { path: 'icons.css', content: buildCss(style) },
    ...buildReact(icons, style),
    { path: 'sprite.svg', content: buildSprite(icons, style) },
    ...buildFlat(icons, style),
    { path: 'sheet.html', content: buildSheetHtml(icons, style) },
  ]
  const keep = new Set([...outputs.map((o) => o.path), 'sheet.png'])
  pruneStale(distDir, 'react/icons', keep)
  pruneStale(distDir, 'flat', keep)

  const files: string[] = []
  const write = (rel: string, content: string | Uint8Array): void => {
    const abs = join(distDir, ...rel.split('/'))
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, content)
    files.push(abs)
  }
  for (const o of outputs) write(o.path, o.content)
  write('sheet.png', renderSheet({ rows: icons.map((icon) => ({ icon, label: icon.name })), style, title: 'Icons' }).png)

  return { distDir, files: files.sort(), iconCount: icons.length, findings }
}
