import type { ClaudeJob, ClaudeResult, ClaudeRunner } from '../../src/engine/runner'

export type Responder = (job: ClaudeJob) => Partial<ClaudeResult> & { structured: unknown; stderr?: readonly string[] }

/**
 * Replays scripted responses in order; throws when the script runs out. Emits start, any scripted
 * stderr lines, and end through onEvent the way the real runners do.
 */
export function fakeRunner(script: Responder[]): ClaudeRunner & { calls: ClaudeJob[]; remaining: () => number } {
  const queue = [...script]
  const calls: ClaudeJob[] = []
  return {
    name: 'fake',
    calls,
    remaining: () => queue.length,
    async run(job, onEvent) {
      calls.push(job)
      const next = queue.shift()
      if (next === undefined) throw new Error(`fake runner exhausted on call ${calls.length}: ${job.prompt.slice(0, 80)}`)
      onEvent?.({ type: 'start', argv: ['fake', '--model', job.model] })
      const { stderr = [], ...r } = next(job)
      for (const line of stderr) onEvent?.({ type: 'stderr', line })
      const result: ClaudeResult = {
        ok: true,
        text: '',
        sessionId: 'sess-1',
        costUsd: 0.01,
        durationMs: 5,
        numTurns: 1,
        raw: null,
        ...r,
      }
      onEvent?.({ type: 'end', exitCode: result.ok ? 0 : 1 })
      return result
    },
  }
}
