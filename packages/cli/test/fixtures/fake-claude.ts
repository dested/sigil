import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ScriptedResult } from '../../src/commands/runner'

/** Writes a fake-claude script (a JSON array of results) into `dir`, resets its cursor, returns the path. */
export function writeScript(dir: string, results: readonly ScriptedResult[], file = 'claude-script.json'): string {
  const path = join(dir, file)
  writeFileSync(path, JSON.stringify(results))
  rmSync(`${path}.cursor`, { force: true })
  return path
}
