import { describe, expect, test } from 'bun:test'
import { drawPrompt, fillDirectionsPrompt, fillSystemPrompt, revisePrompt } from '../../src/engine/prompt'
import { FROZONE_STYLE } from '../fixtures/glyphs'

describe('fillSystemPrompt', () => {
  const text = fillSystemPrompt({ ...FROZONE_STYLE, body: 'BODY' })

  test('fills every placeholder', () => {
    expect(text).toContain('32×32')
    expect(text).toContain('`2`-unit')
    expect(text).toContain('`3`–`29`')
    expect(text).toContain('sheet 3, box 2, bar 1.2')
    expect(text).toContain('`plane, line, dot`')
    expect(text.trimEnd().endsWith('BODY')).toBe(true)
    expect(/\{[a-z_]+\}/.exec(text)).toBeNull()
  })

  test('no accent rule and no blank line left behind without the accent role', () => {
    expect(text).not.toContain('`accent` = a fourth colour')
    expect(text).toContain('exclamation point\'s dot.\nEnabled roles')
  })

  test('accent rule present when accent is a role, and body braces survive', () => {
    const t = fillSystemPrompt({ ...FROZONE_STYLE, roles: ['plane', 'line', 'accent'], radius: {}, body: 'keep {grid} literal' })
    expect(t).toContain('- `accent` = a fourth colour for one emphasised element')
    expect(t).toContain('none named')
    expect(t).toContain('keep {grid} literal')
  })
})

test('fillDirectionsPrompt returns the template', () => {
  expect(fillDirectionsPrompt()).toContain('five complete, distinct `icon.md` style bibles')
})

test('drawPrompt lists names, groups and the png path', () => {
  const p = drawPrompt({
    briefs: [
      { name: 'orders', brief: 'a stack of order tickets' },
      { name: 'pro-shop', brief: 'a hockey stick' },
    ],
    groups: { orders: 'sales' },
    neighboursPng: '/abs/job/neighbours.png',
    neighbourNames: ['discounts'],
    referenceNames: [],
    note: 'thicker',
  })
  expect(p).toContain('- `orders` (group `sales`): a stack of order tickets')
  expect(p).toContain('- `pro-shop`: a hockey stick')
  expect(p).toContain('/abs/job/neighbours.png')
  expect(p).toContain('`discounts`')
  expect(p).toContain('\n\nNotes from the developer for this batch: thicker\nReturn JSON')
})

test('revisePrompt renders findings or "- none"', () => {
  const none = revisePrompt({ round: 2, pngPath: '/j/round-1.png', findings: [], unresolved: ['a'] })
  expect(none).toContain('Round 1 is rendered at /j/round-1.png')
  expect(none).toContain('Machine findings:\n- none\n')
  const some = revisePrompt({
    round: 3,
    pngPath: '/j/round-2.png',
    findings: [{ icon: 'bad', rule: 'schema.attr', severity: 'error', message: 'fill is not allowed' }],
    unresolved: ['bad'],
  })
  expect(some).toContain('- `bad` [schema.attr, error]: fill is not allowed')
})
