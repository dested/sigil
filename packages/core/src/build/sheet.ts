import { fmt } from '../render'
import { isTileTone, type Icon, type IconStyle } from '../types'
import { classedGroups } from './sprite'

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const PAGE_CSS = [
  'body{font:14px system-ui;background:#F3F5F8;margin:24px;color:#1C1A1F}',
  '.row{display:flex;align-items:center;gap:22px;background:#fff;border:1px solid #E2E6ED;border-radius:12px;padding:12px 16px;margin-bottom:10px}',
  '.name{width:150px;font:600 13px ui-monospace,monospace}',
  '.big{background-image:linear-gradient(#E9ECF1 1px,transparent 1px),linear-gradient(90deg,#E9ECF1 1px,transparent 1px);background-size:16px 16px;border:1px solid #E2E6ED}',
  '.pill{display:flex;gap:14px;align-items:center;padding:8px 12px;border-radius:8px}',
].join('\n')

function inlineSvg(icon: Icon, size: number, cls: string): string {
  const g = fmt(icon.grid)
  return `<svg class="${cls}" viewBox="0 0 ${g} ${g}" width="${fmt(size)}" height="${fmt(size)}">${classedGroups(icon)}</svg>`
}

/** Contact sheet driven by icons.css, so it shows exactly what the stylesheet paints. */
export function buildSheetHtml(icons: readonly Icon[], style: IconStyle, cssHref = './icons.css'): string {
  const names = Object.keys(style.tones)
  const tiles = names.filter((n) => {
    const t = style.tones[n]
    return t !== undefined && isTileTone(t)
  })
  const flats = names.filter((n) => !tiles.includes(n))
  const bigTone = flats[0]
  const sorted = [...icons].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))

  const rows = sorted.map((icon) => {
    const cells: string[] = [`<div class="name">${escapeHtml(icon.name)}</div>`]
    if (bigTone !== undefined) {
      const big = inlineSvg(icon, 128, `sg-svg sg-tone-${bigTone}`)
      cells.push(`<div class="big" style="width:128px;height:128px;background-color:${escapeHtml(style.tones[bigTone]?.on ?? '#FFFFFF')}">${big}</div>`)
    }
    for (const t of tiles) {
      const scale = style.tones[t]?.scale ?? 0.6
      for (const size of [64, 44]) {
        const glyph = inlineSvg(icon, Math.round(size * scale), 'sg-svg')
        cells.push(`<span class="sg-tile-${t}" style="width:${size}px;height:${size}px">${glyph}</span>`)
      }
    }
    for (const t of flats) {
      const on = style.tones[t]?.on ?? '#FFFFFF'
      const svgs = [24, 20, 16].map((s) => inlineSvg(icon, s, `sg-svg sg-tone-${t}`)).join('')
      cells.push(`<div class="pill" style="background:${escapeHtml(on)}">${svgs}</div>`)
    }
    return `<div class="row" title="${escapeHtml(icon.brief)}">${cells.join('')}</div>`
  })

  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<title>Icons</title>',
    `<link rel="stylesheet" href="${escapeHtml(cssHref)}">`,
    `<style>\n${PAGE_CSS}\n</style>`,
    '</head>',
    '<body>',
    ...rows,
    '</body>',
    '</html>',
    '',
  ].join('\n')
}
