import { describe, expect, test } from 'bun:test'
import { buildCliArgs, displayArgs, parseCliStdout, resultLine } from '../../src/engine/runner'
import type { ClaudeJob } from '../../src/engine/runner'

const job: ClaudeJob = {
  cwd: '/tmp/job',
  prompt: 'Draw\nthese',
  systemPromptFile: '/tmp/job/system.md',
  allowedTools: ['Read', 'Glob'],
  model: 'opus',
  maxTurns: 6,
}

describe('buildCliArgs', () => {
  test('base flags in order', () => {
    expect(buildCliArgs(job)).toEqual([
      '-p',
      'Draw\nthese',
      '--output-format',
      'json',
      '--model',
      'opus',
      '--allowedTools',
      'Read,Glob',
      '--max-turns',
      '6',
      '--permission-mode',
      'dontAsk',
      '--append-system-prompt-file',
      '/tmp/job/system.md',
    ])
  })

  test('optional flags appended in order', () => {
    const schema = { type: 'object' }
    const args = buildCliArgs({ ...job, jsonSchema: schema, resume: 'sess-9', maxBudgetUsd: 1.5 })
    expect(args.slice(14)).toEqual(['--json-schema', JSON.stringify(schema), '--resume', 'sess-9', '--max-budget-usd', '1.5'])
  })
})

describe('parseCliStdout', () => {
  const line = (o: Record<string, unknown>): string => JSON.stringify(o)

  test('last JSON line wins over warnings and earlier objects', () => {
    const out = [
      'Warning: something noisy',
      line({ session_id: 'old', result: 'x' }),
      line({ is_error: false, result: 'done', structured_output: { icons: [] }, session_id: 's1', total_cost_usd: 0.2, duration_ms: 10, num_turns: 3 }),
      '',
    ].join('\n')
    const r = parseCliStdout(out)
    expect(r.ok).toBe(true)
    expect(r.sessionId).toBe('s1')
    expect(r.structured).toEqual({ icons: [] })
    expect(r.costUsd).toBe(0.2)
    expect(r.numTurns).toBe(3)
    expect(r.text).toBe('done')
  })

  test('strips a json fence from result when no structured_output', () => {
    const r = parseCliStdout(line({ result: '```json\n{"iconMd":"x","changes":"y"}\n```', session_id: 's2' }))
    expect(r.structured).toEqual({ iconMd: 'x', changes: 'y' })
  })

  test('non-JSON result gives structured null', () => {
    expect(parseCliStdout(line({ result: 'just words', session_id: 's' })).structured).toBeNull()
  })

  test('is_error ⇒ ok false', () => {
    const r = parseCliStdout(line({ is_error: true, result: 'boom', session_id: 's3', subtype: 'error_max_turns' }))
    expect(r.ok).toBe(false)
  })

  test('malformed stdout throws', () => {
    expect(() => parseCliStdout('not json at all\n{broken')).toThrow()
    expect(() => parseCliStdout(line({ result: 'no session id' }))).toThrow()
  })
})

describe('log helpers', () => {
  test('displayArgs hides the prompt', () => {
    const shown = displayArgs(buildCliArgs(job))
    expect(shown[1]).toBe('<prompt 10 chars>')
    expect(shown.slice(2, 4)).toEqual(['--output-format', 'json'])
    expect(shown.join(' ')).not.toContain('Draw')
  })

  test('resultLine summarises a result', () => {
    const r = parseCliStdout(JSON.stringify({ result: 'x', session_id: 's', total_cost_usd: 0.1234, num_turns: 2, duration_ms: 1500 }))
    expect(resultLine(r)).toBe('result: ok=true cost=$0.1234 turns=2 duration=1.5s')
  })
})
