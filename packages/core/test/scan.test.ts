import { describe, expect, test } from 'bun:test'
import { resolve } from 'node:path'
import { proposalsToManifest, scanProject, scanSource, slugify, UTILITY_LUCIDE, type ScanUsage } from '../src/scan'
import { NAME_RE } from '../src/svg'

const APP = resolve(import.meta.dir, 'fixtures/scan-app')
const result = scanProject(APP)

const usage = (file: string, line: number): ScanUsage | undefined =>
  result.usages.find((u) => u.file === file && u.line === line)

describe('scanProject', () => {
  test('walks every source file and finds every usage', () => {
    expect(result.files).toBe(6)
    expect(result.usages.length).toBe(15)
  })

  test('ignores comments, strings, JSX text, type imports and dynamic members', () => {
    const sidebar = result.usages.filter((u) => u.file === 'src/components/Sidebar.tsx')
    expect(sidebar.map((u) => u.lucide)).toEqual(['Home', 'Users', 'ShoppingCart', 'Settings', 'ChevronRight'])
    const roster = result.usages.filter((u) => u.file === 'src/routes/roster/index.tsx')
    expect(roster.map((u) => u.lucide)).toEqual(['Users', 'Plus', 'Search'])
    const checkout = result.usages.filter((u) => u.file === 'src/routes/pos.checkout.tsx')
    expect(checkout.map((u) => u.lucide)).toEqual(['ShoppingCart', 'X'])
  })

  test('resolves aliases and namespace imports', () => {
    expect(usage('src/components/Sidebar.tsx', 6)?.lucide).toBe('Home')
    expect(usage('src/components/Toolbar.tsx', 9)?.lucide).toBe('Calendar')
    const ns = result.usages.filter((u) => u.file === 'src/routes/(admin)/settings/page.tsx')
    expect(ns.map((u) => u.lucide)).toEqual(['Settings', 'X'])
  })

  test('label from a prop on the element or the enclosing element', () => {
    expect(usage('src/routes/roster/index.tsx', 7)?.label).toBe('Roster') // aria-label
    expect(usage('src/routes/(admin)/settings/page.tsx', 7)?.label).toBe('Settings') // title
    expect(usage('src/routes/pos.checkout.tsx', 13)?.label).toBe('Close cart') // icon={X} label=…
  })

  test('label from the enclosing object literal', () => {
    expect(usage('src/components/Sidebar.tsx', 7)?.label).toBe('Roster')
    expect(usage('src/components/Sidebar.tsx', 11)?.label).toBe('Point of Sale') // title: 2 lines up
    expect(usage('src/components/Toolbar.tsx', 9)?.label).toBe('Schedule') // label: 3 lines up
  })

  test('label from a text child after the tag', () => {
    expect(usage('src/routes/roster/index.tsx', 8)?.label).toBe('Add player')
    expect(usage('src/routes/pos.checkout.tsx', 12)?.label).toBe('Point of Sale')
    expect(usage('src/components/Toolbar.tsx', 13)?.label).toBe('New')
    expect(usage('src/routes/roster/index.tsx', 9)?.label).toBeNull()
  })

  test('area: route folder, route group skipped, flat route, else first dir', () => {
    expect(usage('src/routes/roster/index.tsx', 7)?.area).toBe('roster')
    expect(usage('src/routes/(admin)/settings/page.tsx', 7)?.area).toBe('settings')
    expect(usage('src/routes/pos.checkout.tsx', 12)?.area).toBe('pos')
    expect(usage('src/components/Sidebar.tsx', 6)?.area).toBe('components')
  })

  test('tool proposals: merged per glyph, sorted by uses, collisions suffixed', () => {
    expect(result.proposals.map((p) => [p.name, p.lucide, p.usages.length])).toEqual([
      ['point-of-sale', 'ShoppingCart', 2],
      ['roster', 'Users', 2],
      ['settings', 'Settings', 2],
      ['home', 'Home', 1],
      ['roster-2', 'Contact', 1],
      ['schedule', 'Calendar', 1],
    ])
    for (const p of result.proposals) {
      expect(p.kind).toBe('tool')
      expect(NAME_RE.test(p.name)).toBe(true)
    }
    const pos = result.proposals[0]
    expect(pos?.brief).toBe('Point of Sale: replace the Lucide "ShoppingCart" glyph — draw the real object')
    expect(pos?.group).toBe('pos')
  })

  test('utilities are separated', () => {
    expect(result.utilities.map((p) => p.lucide).sort()).toEqual(['ChevronRight', 'Plus', 'Search', 'X'])
    for (const p of result.utilities) expect(p.kind).toBe('utility')
    const chevron = result.utilities.find((p) => p.lucide === 'ChevronRight')
    expect(chevron?.name).toBe('chevron-right')
    expect(chevron?.brief).toBe('the Lucide "ChevronRight" glyph — draw the real object')
  })

  test('the utility rule keeps destinations and objects as tools', () => {
    for (const u of ['ChevronRight', 'X', 'Plus', 'Search', 'Menu', 'Loader2']) expect(UTILITY_LUCIDE.has(u)).toBe(true)
    for (const t of ['Settings', 'Calendar', 'Bell', 'Users', 'ShoppingCart', 'Home']) expect(UTILITY_LUCIDE.has(t)).toBe(false)
  })

  test('include limits the walk', () => {
    const routesOnly = scanProject(APP, { include: ['src/routes'] })
    expect(routesOnly.files).toBe(3)
    expect(routesOnly.usages.every((u) => u.file.startsWith('src/routes/'))).toBe(true)
  })
})

describe('scanSource', () => {
  test('files without lucide imports yield nothing', () => {
    expect(scanSource(`import { Users } from './users'\nconst a = <Users />`, 'src/a.tsx')).toEqual([])
  })

  test('Lucide-prefixed and Icon-suffixed exports are canonicalised', () => {
    const src = `import { LucideHome, UsersIcon } from 'lucide-react'\nconst a = [LucideHome, UsersIcon]`
    expect(scanSource(src, 'src/a.tsx').map((u) => u.lucide)).toEqual(['Home', 'Users'])
  })

  test('object keys named like an icon are not usages', () => {
    const src = `import { Users } from 'lucide-react'\nconst m = { Users: 1 }\nconst n = { a: Users }`
    expect(scanSource(src, 'src/a.tsx').map((u) => u.line)).toEqual([3])
  })
})

describe('proposalsToManifest', () => {
  test('adds new entries with lucide and group', () => {
    const m = proposalsToManifest(result.proposals, {})
    expect(Object.keys(m).sort()).toEqual(['home', 'point-of-sale', 'roster', 'roster-2', 'schedule', 'settings'])
    expect(m['roster']).toEqual({
      brief: 'Roster: replace the Lucide "Users" glyph — draw the real object',
      group: 'roster',
      lucide: 'Users',
    })
  })

  test('never overwrites an existing brief; fills missing lucide/group only', () => {
    const m = proposalsToManifest(result.proposals, {
      roster: { brief: 'A team roster clipboard', approved: true },
      settings: { brief: 'Gear', group: 'admin', lucide: 'Cog' },
    })
    expect(m['roster']).toEqual({ brief: 'A team roster clipboard', approved: true, lucide: 'Users', group: 'roster' })
    expect(m['settings']).toEqual({ brief: 'Gear', group: 'admin', lucide: 'Cog' })
  })

  test('skips a glyph already claimed under another name', () => {
    const m = proposalsToManifest(result.proposals, { 'pro-shop': { brief: 'Cart', lucide: 'ShoppingCart' } })
    expect(m['point-of-sale']).toBeUndefined()
    expect(m['pro-shop']).toEqual({ brief: 'Cart', lucide: 'ShoppingCart' })
  })
})

describe('slugify', () => {
  test.each([
    ['Point of Sale', 'point-of-sale'],
    ['Pro shop', 'pro-shop'],
    ['At-risk', 'at-risk'],
    ['Rock Ready evals', 'rock-ready-evals'],
    ["Don't miss", 'dont-miss'],
    ['Café & Bar', 'cafe-bar'],
    ['  Email & Newsletter  ', 'email-newsletter'],
    ['BarChart 3', 'barchart-3'],
    ['!!!', ''],
    ['', ''],
  ])('%p → %p', (input, expected) => {
    expect(slugify(input)).toBe(expected)
  })
})
