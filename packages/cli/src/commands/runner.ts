import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolveRunner, type ClaudeResult, type ClaudeRunner, type Project } from '@sigil/core'

/** One scripted reply for the fake runner (tests only). */
export interface ScriptedResult {
  readonly structured: unknown
  readonly ok?: boolean
  readonly sessionId?: string
  readonly costUsd?: number
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function toScripted(v: unknown, i: number, file: string): ScriptedResult {
  if (!isRecord(v) || !('structured' in v)) throw new Error(`${file}: entry ${i} needs a "structured" field`)
  const { ok, sessionId, costUsd } = v
  if (ok !== undefined && typeof ok !== 'boolean') throw new Error(`${file}: entry ${i}: ok must be a boolean`)
  if (sessionId !== undefined && typeof sessionId !== 'string') throw new Error(`${file}: entry ${i}: sessionId must be a string`)
  if (costUsd !== undefined && typeof costUsd !== 'number') throw new Error(`${file}: entry ${i}: costUsd must be a number`)
  return {
    structured: v.structured,
    ...(ok !== undefined ? { ok } : {}),
    ...(sessionId !== undefined ? { sessionId } : {}),
    ...(costUsd !== undefined ? { costUsd } : {}),
  }
}

function readScript(file: string): ScriptedResult[] {
  const data: unknown = JSON.parse(readFileSync(file, 'utf8'))
  if (!Array.isArray(data)) throw new Error(`${file}: expected a JSON array of scripted results`)
  return data.map((v: unknown, i) => toScripted(v, i, file))
}

function readCursor(file: string): number {
  if (!existsSync(file)) return 0
  const n = Number.parseInt(readFileSync(file, 'utf8').trim(), 10)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

/**
 * Replays `SIGIL_FAKE_CLAUDE` (a JSON array of results) in order. The cursor lives in `<file>.cursor`
 * so one script spans several CLI processes; reads and writes are synchronous, so concurrent jobs in
 * one process never take the same entry.
 */
export function scriptedRunner(file: string): ClaudeRunner {
  const cursorFile = `${file}.cursor`
  return {
    name: 'fake',
    async run(job): Promise<ClaudeResult> {
      const script = readScript(file)
      const at = readCursor(cursorFile)
      const next = script[at]
      if (next === undefined) throw new Error(`fake claude exhausted after ${script.length} results: ${job.prompt.slice(0, 80)}`)
      writeFileSync(cursorFile, String(at + 1))
      const ok = next.ok ?? true
      return {
        ok,
        text: ok ? '' : 'fake claude failure',
        structured: next.structured,
        sessionId: next.sessionId ?? `fake-${at}`,
        costUsd: next.costUsd ?? 0.01,
        durationMs: 1,
        numTurns: 1,
        raw: null,
      }
    },
  }
}

export function parseEngine(value: string | undefined): 'cli' | 'sdk' | undefined {
  if (value === undefined) return undefined
  if (value === 'cli' || value === 'sdk') return value
  throw new Error(`--engine must be cli or sdk, got ${value}`)
}

export function pickRunner(project: Project, engineFlag?: string): ClaudeRunner {
  const fake = process.env.SIGIL_FAKE_CLAUDE
  if (fake !== undefined && fake !== '') return scriptedRunner(fake)
  return resolveRunner(engineFlag === 'sdk' ? 'sdk' : engineFlag === 'cli' ? 'cli' : project.config.engine)
}
