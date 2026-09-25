import { fmt, paintIcon, paintTile, shapeToSvg } from '../render'
import { isTileTone, type Icon, type IconStyle } from '../types'

export interface BuildFile {
  /** Relative to the dist dir, `/`-separated. */
  readonly path: string
  readonly content: string
}

/** Role groups with `sg-<role>` classes and no paint; icons.css supplies the colour. */
export function classedGroups(icon: Icon): string {
  return icon.layers.map((l) => `<g class="sg-${l.role}">${l.shapes.map(shapeToSvg).join('')}</g>`).join('')
}

export function buildSprite(icons: readonly Icon[], _style: IconStyle): string {
  const symbols = icons.map((icon) => {
    const g = fmt(icon.grid)
    return `<symbol id="sg-${icon.name}" viewBox="0 0 ${g} ${g}">${classedGroups(icon)}</symbol>`
  })
  return `<svg xmlns="http://www.w3.org/2000/svg" style="display:none">${symbols.join('')}</svg>\n`
}

/** Self-contained painted SVGs, one per tone × icon, for consumers without the stylesheet. */
export function buildFlat(icons: readonly Icon[], style: IconStyle): BuildFile[] {
  const out: BuildFile[] = []
  for (const [toneName, tone] of Object.entries(style.tones)) {
    for (const icon of icons) {
      const content = isTileTone(tone) ? paintTile(icon, style, toneName, 64) : paintIcon(icon, style, toneName)
      out.push({ path: `flat/${toneName}/${icon.name}.svg`, content: `${content}\n` })
    }
  }
  return out
}
