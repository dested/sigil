import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve, sep } from 'node:path'
import { buildProject, type BuildResult } from '../src/build'
import { pascal } from '../src/build/react'
import { loadProject } from '../src/project'

const REPO = resolve(import.meta.dir, '../../..')
const FIXTURE = join(REPO, 'fixtures/frozone')
// react is installed for packages/lab only, so a temp dist cannot resolve it by walking up.
const REACT_TYPES = join(REPO, 'packages/lab/node_modules/@types/react')

let tmp = ''
let dist = ''
let result: BuildResult

const rel = (abs: string): string => relative(dist, abs).split(sep).join('/')
const read = (p: string): string => readFileSync(join(dist, p), 'utf8')

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'sigil-build-'))
  dist = join(tmp, 'dist')
  result = buildProject(loadProject(FIXTURE), { distDir: dist })
})

afterAll(() => {
  if (tmp !== '') rmSync(tmp, { recursive: true, force: true })
})

describe('pascal', () => {
  test('kebab to PascalCase, digit prefix', () => {
    expect(pascal('point-of-sale')).toBe('PointOfSale')
    expect(pascal('at-risk')).toBe('AtRisk')
    expect(pascal('3d-view')).toBe('Icon3dView')
  })
})

describe('buildProject on the Frozone fixture', () => {
  test('writes every output', () => {
    expect(result.iconCount).toBe(45)
    const files = result.files.map(rel)
    for (const f of ['icons.css', 'react/glyph.tsx', 'react/index.tsx', 'sprite.svg', 'sheet.html', 'sheet.png']) {
      expect(files).toContain(f)
    }
    expect(files.filter((f) => f.startsWith('react/icons/') && f.endsWith('.tsx'))).toHaveLength(45)
    expect(files.filter((f) => f.startsWith('flat/'))).toHaveLength(135)
    expect(files).toContain('flat/tile/at-risk.svg')
    expect(files).toContain('flat/on-dark/at-risk.svg')
    expect([...result.files].sort()).toEqual([...result.files])
  })

  test('icons.css carries tones and tiles', () => {
    const css = read('icons.css')
    expect(css).toContain('.sg-tone-inline { --sg-line: #8A1E3D; --sg-plane: #EDB9C8 }')
    const tile = css.split('\n').find((l) => l.startsWith('.sg-tile-tile {'))
    expect(tile).toBeDefined()
    expect(tile).toContain('linear-gradient(160deg, #A12A4C 0%, #7C1936 55%, #62122B 100%)')
    expect(tile).toContain('border-radius: 27%')
    expect(css.endsWith('\n')).toBe(true)
  })

  test('AtRisk keeps paint order plane, line, plane, line, dot', () => {
    const src = read('react/icons/AtRisk.tsx')
    const roles = [...src.matchAll(/\{ role: '(\w+)'/g)].map((m) => m[1])
    expect(roles).toEqual(['plane', 'line', 'plane', 'line', 'dot'])
    expect(src).toContain("export const AtRisk = createIcon('at-risk', [")
    expect(src).toContain('] as const)')
  })

  test('sprite has one symbol per icon', () => {
    const sprite = read('sprite.svg')
    expect(sprite).toContain('<symbol id="sg-at-risk"')
    expect(sprite.match(/<symbol /g)).toHaveLength(45)
  })

  test('sheet.html has one row per icon and links the stylesheet', () => {
    const html = read('sheet.html')
    expect(html.match(/class="row"/g)).toHaveLength(45)
    expect(html).toContain('href="./icons.css"')
  })

  test(
    'generated React typechecks under strict flags',
    () => {
      const tsconfig = {
        compilerOptions: {
          strict: true,
          noUncheckedIndexedAccess: true,
          exactOptionalPropertyTypes: true,
          jsx: 'react-jsx',
          module: 'esnext',
          moduleResolution: 'bundler',
          target: 'es2022',
          skipLibCheck: true,
          noEmit: true,
          types: [],
          paths: { react: [REACT_TYPES], 'react/*': [`${REACT_TYPES}/*`] },
        },
        files: ['dist/react/index.tsx'],
      }
      const configPath = join(tmp, 'tsconfig.json')
      writeFileSync(configPath, JSON.stringify(tsconfig, null, 2))
      const proc = Bun.spawnSync(['bun', 'x', 'tsc', '-p', configPath], { cwd: REPO, stdout: 'pipe', stderr: 'pipe' })
      const out = `${proc.stdout.toString()}${proc.stderr.toString()}`
      if (proc.exitCode !== 0) console.log(out)
      expect(proc.exitCode).toBe(0)
    },
    120_000,
  )

  test('rebuild prunes stale icon modules and flat files only', () => {
    mkdirSync(join(dist, 'react/icons'), { recursive: true })
    mkdirSync(join(dist, 'flat/inline'), { recursive: true })
    mkdirSync(join(dist, 'flat/gone-tone'), { recursive: true })
    writeFileSync(join(dist, 'react/icons/Zzz.tsx'), 'stale')
    writeFileSync(join(dist, 'flat/inline/zzz.svg'), 'stale')
    writeFileSync(join(dist, 'flat/gone-tone/at-risk.svg'), 'stale')
    writeFileSync(join(dist, 'keep-me.txt'), 'mine')
    buildProject(loadProject(FIXTURE), { distDir: dist })
    expect(existsSync(join(dist, 'react/icons/Zzz.tsx'))).toBe(false)
    expect(existsSync(join(dist, 'flat/inline/zzz.svg'))).toBe(false)
    expect(existsSync(join(dist, 'flat/gone-tone'))).toBe(false)
    expect(existsSync(join(dist, 'sheet.html'))).toBe(true)
    expect(existsSync(join(dist, 'keep-me.txt'))).toBe(true)
  })
})
