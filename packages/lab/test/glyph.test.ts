import { describe, expect, test } from 'bun:test'
import type { ToneStyle } from '@sigil/core'
import { darkTone, firstInlineTone, glyphMarkup, tileMarkup } from '../src/lib/glyph'

const SRC = `<?xml version="1.0" encoding="UTF-8"?>
<!-- drawn by sigil -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" data-sigil="1" data-brief="a two-by-two grid of app tiles">
  <g data-role="plane"><rect x="4.5" y="4.5" width="10" height="10" rx="2.5"/></g>
  <g data-role='line'><rect x="4.5" y="4.5" width="10" height="10" rx="2.5"/></g>
</svg>`

const frozone: { readonly tones: Readonly<Record<string, ToneStyle>> } = {
  tones: {
    tile: {
      bg: { angle: 160, stops: ['#A12A4C 0%', '#7C1936 55%', '#62122B 100%'] },
      line: '#FFFFFF',
      plane: 'rgba(255,255,255,.26)',
      on: '#FFFFFF',
      radius: '27%',
      scale: 0.6,
    },
    inline: { line: '#8A1E3D', plane: '#EDB9C8', on: '#FFFFFF', scale: 1 },
    'on-dark': { line: 'rgba(255,255,255,.88)', plane: 'rgba(255,255,255,.2)', on: '#0F1F3A', scale: 1 },
  },
}

describe('glyphMarkup', () => {
  test('replaces data-role with class, sets size and tone class, drops data-brief', () => {
    const out = glyphMarkup(SRC, { tone: 'inline', size: 20 })
    expect(out).toContain('class="sg-plane"')
    expect(out).toContain('class="sg-line"')
    expect(out).not.toContain('data-role')
    expect(out).not.toContain('data-brief')
    expect(out).not.toContain('data-sigil')
    expect(out).not.toContain('<?xml')
    expect(out).not.toContain('<!--')
    expect(out).toContain('class="sg-svg sg-tone-inline"')
    expect(out).toContain('width="20" height="20"')
    expect(out).not.toContain('width="32"')
    expect(out).toContain('viewBox="0 0 32 32"')
    expect(out).toContain('<rect x="4.5" y="4.5" width="10" height="10" rx="2.5"/>')
  })

  test('throws on a non-svg string', () => {
    expect(() => glyphMarkup('<div>nope</div>', { tone: 'inline', size: 16 })).toThrow('not a sigil svg')
  })
})

describe('tileMarkup', () => {
  test('wraps in the tile span with the scaled inner size', () => {
    const out = tileMarkup(SRC, { tone: 'tile', size: 44, scale: 0.6 })
    expect(out.startsWith('<span class="sg-tile-tile" style="width:44px;height:44px">')).toBe(true)
    expect(out.endsWith('</span>')).toBe(true)
    expect(out).toContain('width="26" height="26"')
    expect(out).toContain('class="sg-svg sg-tone-tile"')
  })
})

describe('tones', () => {
  test('darkTone finds on-dark in the Frozone style', () => {
    expect(darkTone(frozone)).toBe('on-dark')
  })

  test('darkTone is null when every tone sits on a light surface', () => {
    const light: { readonly tones: Readonly<Record<string, ToneStyle>> } = {
      tones: { inline: { line: '#000', plane: '#ccc', on: 'rgb(250, 250, 250)', scale: 1 } },
    }
    expect(darkTone(light)).toBeNull()
  })

  test('firstInlineTone skips tile tones', () => {
    expect(firstInlineTone(frozone)).toBe('inline')
  })
})
