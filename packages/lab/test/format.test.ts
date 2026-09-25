import { describe, expect, test } from 'bun:test'
import { bytes, elapsed, money, titleCase } from '../src/lib/format'

const T0 = '2026-09-25T12:00:00.000Z'
const at = (s: number): number => Date.parse(T0) + s * 1000

describe('elapsed', () => {
  test('seconds under a minute', () => {
    expect(elapsed(T0, undefined, at(0))).toBe('0s')
    expect(elapsed(T0, undefined, at(12))).toBe('12s')
    expect(elapsed(T0, undefined, at(59))).toBe('59s')
  })

  test('minutes pad the seconds', () => {
    expect(elapsed(T0, undefined, at(60))).toBe('1m 00s')
    expect(elapsed(T0, undefined, at(65))).toBe('1m 05s')
    expect(elapsed(T0, undefined, at(72))).toBe('1m 12s')
  })

  test('hours pad the minutes', () => {
    expect(elapsed(T0, undefined, at(3600 + 5 * 60))).toBe('1h 05m')
  })

  test('an end time wins over now', () => {
    expect(elapsed(T0, '2026-09-25T12:00:30.000Z', at(999))).toBe('30s')
  })

  test('clock skew never goes negative, garbage is a dash', () => {
    expect(elapsed(T0, undefined, at(-5))).toBe('0s')
    expect(elapsed('not a date', undefined, at(0))).toBe('—')
  })
})

describe('other formatters', () => {
  test('money, bytes, titleCase', () => {
    expect(money(1.2345)).toBe('$1.23')
    expect(bytes(812)).toBe('812 B')
    expect(bytes(12_700)).toBe('12.4 KB')
    expect(titleCase('point-of-sale')).toBe('Point Of Sale')
  })
})
