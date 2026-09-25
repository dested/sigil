import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { z } from 'zod'

export interface ClaudeJob {
  readonly cwd: string
  readonly prompt: string
  readonly systemPromptFile: string
  readonly allowedTools: readonly string[]
  readonly model: string
  readonly maxTurns: number
  readonly jsonSchema?: Record<string, unknown>
  readonly resume?: string
  readonly maxBudgetUsd?: number
}

export interface ClaudeResult {
  readonly ok: boolean
  readonly text: string
  readonly structured: unknown
  readonly sessionId: string
  readonly costUsd: number
  readonly durationMs: number
  readonly numTurns: number
  readonly raw: unknown
}

export type RunnerEvent =
  | { readonly type: 'start'; readonly argv: readonly string[] }
  | { readonly type: 'stderr'; readonly line: string }
  | { readonly type: 'end'; readonly exitCode: number }

export interface ClaudeRunner {
  readonly name: 'cli' | 'sdk' | 'fake'
  run(job: ClaudeJob, onEvent?: (e: RunnerEvent) => void): Promise<ClaudeResult>
}

export const CliResultSchema = z.object({
  is_error: z.boolean().default(false),
  result: z.string().default(''),
  structured_output: z.unknown().optional(),
  session_id: z.string(),
  total_cost_usd: z.number().default(0),
  duration_ms: z.number().default(0),
  num_turns: z.number().default(0),
  subtype: z.string().optional(),
})

export function buildCliArgs(job: ClaudeJob): string[] {
  return [
    '-p',
    job.prompt,
    '--output-format',
    'json',
    '--model',
    job.model,
    '--allowedTools',
    job.allowedTools.join(','),
    '--max-turns',
    String(job.maxTurns),
    '--permission-mode',
    'dontAsk',
    '--append-system-prompt-file',
    job.systemPromptFile,
    ...(job.jsonSchema !== undefined ? ['--json-schema', JSON.stringify(job.jsonSchema)] : []),
    ...(job.resume !== undefined ? ['--resume', job.resume] : []),
    ...(job.maxBudgetUsd !== undefined ? ['--max-budget-usd', String(job.maxBudgetUsd)] : []),
  ]
}

/** argv for logs: the prompt (the value after `-p`) replaced by its length. */
export function displayArgs(args: readonly string[]): string[] {
  return args.map((a, i) => (i > 0 && args[i - 1] === '-p' ? `<prompt ${a.length} chars>` : a))
}

/** The closing summary line a runner emits after a parsed result. */
export function resultLine(res: ClaudeResult): string {
  return `result: ok=${res.ok} cost=$${res.costUsd.toFixed(4)} turns=${res.numTurns} duration=${(res.durationMs / 1000).toFixed(1)}s`
}

const isRecord =(v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Parses model text as JSON, tolerating a ```json fence around it. `null` when it is not JSON. */
export function tryParseJson(text: string): { readonly value: unknown } | null {
  const trimmed = text.trim()
  const fenced = /^```[a-zA-Z]*\s*\n([\s\S]*?)\n?```$/.exec(trimmed)
  const body = fenced?.[1] ?? trimmed
  if (body === '') return null
  try {
    const value: unknown = JSON.parse(body)
    return { value }
  } catch {
    return null
  }
}

function lastJsonObject(stdout: string): Record<string, unknown> | null {
  const lines = stdout.split(/\r?\n/)
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]?.trim() ?? ''
    if (!line.startsWith('{')) continue
    const parsed = tryParseJson(line)
    if (parsed !== null && isRecord(parsed.value)) return parsed.value
  }
  // Pretty-printed output spans lines; fall back to the whole buffer.
  const whole = tryParseJson(stdout)
  return whole !== null && isRecord(whole.value) ? whole.value : null
}

export function toClaudeResult(data: z.output<typeof CliResultSchema>, raw: unknown): ClaudeResult {
  const structured = data.structured_output ?? tryParseJson(data.result)?.value ?? null
  return {
    ok: !data.is_error,
    text: data.result,
    structured,
    sessionId: data.session_id,
    costUsd: data.total_cost_usd,
    durationMs: data.duration_ms,
    numTurns: data.num_turns,
    raw,
  }
}

export function parseCliStdout(stdout: string): ClaudeResult {
  const obj = lastJsonObject(stdout)
  if (obj === null) throw new Error(`claude printed no JSON result: ${stdout.slice(0, 500)}`)
  const parsed = CliResultSchema.safeParse(obj)
  if (!parsed.success) {
    const reason = parsed.error.issues.map((i) => `${i.path.map(String).join('.') || '(root)'}: ${i.message}`).join('; ')
    throw new Error(`claude result JSON has an unexpected shape: ${reason}`)
  }
  return toClaudeResult(parsed.data, obj)
}

/**
 * npm on Windows installs `claude.cmd`, and cmd.exe mangles arguments containing newlines. The shim
 * only forwards to a real `claude.exe`, so spawn that directly and multi-line prompts survive argv.
 */
function unwrapCmdShim(shim: string): string | null {
  let text: string
  try {
    text = readFileSync(shim, 'utf8')
  } catch {
    return null
  }
  const dir = dirname(shim)
  for (const m of text.matchAll(/"([^"]*\.exe)"/gi)) {
    const target = m[1]
    if (target === undefined) continue
    const resolved = target.replace(/%~?dp0%\\?/gi, `${dir}\\`)
    if (existsSync(resolved)) return resolved
  }
  const sibling = join(dir, 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe')
  return existsSync(sibling) ? sibling : null
}

export function resolveClaudeBinary(): string {
  const found = Bun.which('claude')
  if (found === null) throw new Error('claude CLI not found on PATH')
  if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(found)) {
    const exe = unwrapCmdShim(found)
    if (exe === null) {
      throw new Error(`claude resolved to ${found}, a batch shim whose claude.exe could not be located; put claude.exe on PATH`)
    }
    return exe
  }
  return found
}

async function pumpLines(stream: ReadableStream<Uint8Array>, onLine: (line: string) => void, sink: string[]): Promise<void> {
  const decoder = new TextDecoder()
  let buf = ''
  const reader = stream.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    const text = decoder.decode(value, { stream: true })
    sink.push(text)
    buf += text
    const parts = buf.split(/\r?\n/)
    buf = parts.pop() ?? ''
    for (const line of parts) if (line !== '') onLine(line)
  }
  const tail = buf + decoder.decode()
  if (tail !== '') onLine(tail)
}

export const cliRunner: ClaudeRunner = {
  name: 'cli',
  async run(job, onEvent) {
    const bin = resolveClaudeBinary()
    const args = buildCliArgs(job)
    onEvent?.({ type: 'start', argv: ['claude', ...displayArgs(args)] })
    const proc = Bun.spawn([bin, ...args], {
      cwd: job.cwd,
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
      env: process.env,
    })
    const stderrChunks: string[] = []
    const [stdout, , exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      pumpLines(proc.stderr, (line) => onEvent?.({ type: 'stderr', line }), stderrChunks),
      proc.exited,
    ])
    onEvent?.({ type: 'end', exitCode })
    try {
      const res = parseCliStdout(stdout)
      onEvent?.({ type: 'stderr', line: resultLine(res) })
      return res
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      const stderr = stderrChunks.join('').slice(0, 500)
      if (exitCode !== 0) throw new Error(`claude exited with code ${exitCode}: ${stderr || reason}`)
      throw new Error(`${reason}${stderr === '' ? '' : `\nstderr: ${stderr}`}`)
    }
  },
}

export const sdkRunner: ClaudeRunner = {
  name: 'sdk',
  async run(job, onEvent) {
    // Loaded lazily so the CLI path never pays for the SDK import.
    const { query } = await import('@anthropic-ai/claude-agent-sdk')
    onEvent?.({ type: 'start', argv: ['sdk:query', '--model', job.model] })
    const messages = query({
      prompt: job.prompt,
      options: {
        cwd: job.cwd,
        model: job.model,
        allowedTools: [...job.allowedTools],
        maxTurns: job.maxTurns,
        // Same mode as the CLI runner: non-interactive, only allow-listed tools run, nothing prompts.
        permissionMode: 'dontAsk',
        systemPrompt: { type: 'preset', preset: 'claude_code', append: readFileSync(job.systemPromptFile, 'utf8') },
        env: { ...process.env },
        stderr: (data: string) => {
          for (const line of data.split(/\r?\n/)) if (line !== '') onEvent?.({ type: 'stderr', line })
        },
        ...(job.resume !== undefined ? { resume: job.resume } : {}),
        ...(job.maxBudgetUsd !== undefined ? { maxBudgetUsd: job.maxBudgetUsd } : {}),
        ...(job.jsonSchema !== undefined ? { outputFormat: { type: 'json_schema', schema: job.jsonSchema } } : {}),
      },
    })
    let last: ClaudeResult | null = null
    for await (const msg of messages) {
      if (msg.type !== 'result') continue
      const success = msg.subtype === 'success'
      last = toClaudeResult(
        {
          is_error: msg.is_error || !success,
          result: success ? msg.result : msg.errors.join('\n'),
          structured_output: success ? msg.structured_output : undefined,
          session_id: msg.session_id,
          total_cost_usd: msg.total_cost_usd,
          duration_ms: msg.duration_ms,
          num_turns: msg.num_turns,
          subtype: msg.subtype,
        },
        msg,
      )
    }
    onEvent?.({ type: 'end', exitCode: last?.ok === true ? 0 : 1 })
    if (last === null) throw new Error('Agent SDK query ended without a result message')
    onEvent?.({ type: 'stderr', line: resultLine(last) })
    return last
  },
}

export function resolveRunner(engine: 'cli' | 'sdk'): ClaudeRunner {
  return engine === 'sdk' ? sdkRunner : cliRunner
}
