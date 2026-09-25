#!/usr/bin/env bun
import { defineCommand, runMain } from 'citty'
import { commands } from './commands/index'

const main = defineCommand({
  meta: { name: 'sigil', version: '0.0.1', description: 'Custom icon system for Claude Code projects' },
  subCommands: commands,
})

const VALUE_FLAGS = new Set(['--cwd'])

/**
 * citty takes the first non-flag token as the subcommand, so `sigil --cwd dir status` would look up a
 * command named `dir`. Leading flags are moved behind the subcommand, where every command accepts them.
 */
export function hoistLeadingFlags(argv: readonly string[]): string[] {
  const leading: string[] = []
  let i = 0
  while (i < argv.length) {
    const arg = argv[i]
    if (arg === undefined || !arg.startsWith('-') || arg === '--help' || arg === '-h' || arg === '--version') break
    leading.push(arg)
    const next = argv[i + 1]
    if (VALUE_FLAGS.has(arg) && next !== undefined) {
      leading.push(next)
      i += 2
    } else i += 1
  }
  const command = argv[i]
  if (leading.length === 0 || command === undefined) return [...argv]
  return [command, ...leading, ...argv.slice(i + 1)]
}

void runMain(main, { rawArgs: hoistLeadingFlags(process.argv.slice(2)) })
