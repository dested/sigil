# Sigil architecture contract

- **Date:** 2026-09-25
- **Status:** active — the build contract every implementation agent reads first. Fable owns it; agents never edit it.
- **Type:** spec
- **Parent:** `plans/2026-09-25-sigil.md` (the founding plan; read §2–§4 for the why)

## Decisions taken (2026-09-25)

- Monorepo, bun workspaces: `packages/core` (`@sigil/core`), `packages/cli` (`sigil`, bin `sigil`), `packages/lab` (`@sigil/lab`). Consumers install `sigil` only.
- Roles capped at `plane | line | dot | accent`. Lucide stays for utility glyphs; `migrate` (M4) keeps a keep-list.
- Frozone's 45 icons live here as `fixtures/frozone/` only. frozenropes is untouched until M5.
- Engine: headless `claude -p` (the developer's own Claude Code auth) behind a `ClaudeRunner` interface; an Agent SDK runner implements the same interface. Drawing model `opus`.
- **The loop is orchestrated, not self-driven.** The model never runs `sigil render`. Each round: the model returns SVGs as structured JSON (`--json-schema`); the orchestrator parses, lints, renders a PNG sheet and runs checks; the next round resumes the same session (`--resume <session_id>`) with the PNG path + findings and asks for a critique and revisions. Confirmed on 2026-09-25: `--resume` works in print mode; `--append-system-prompt-file` is honoured; `--json-schema` output lands in `structured_output`; auth is the subscription login; stdin must be `< /dev/null` / ignored or the CLI waits 3s.
- Lab: Vite + React 19 + Tailwind 4; server is Bun + tRPC 11 on **http://localhost:7444**, Vite dev on 7445 proxying `/trpc` and `/files`. No websockets: react-query polling.
- Tests: `bun test` (no vitest). Typecheck: `tsc --noEmit` per package, typescript 5.9.
- CSS/class prefix for generated output: `sg-`.

## Versions (pinned in package.json)

`zod ^4.6.5` · `yaml ^2.9.1` · `@resvg/resvg-js ^2.6.2` · `citty ^0.2.2` · `@anthropic-ai/claude-agent-sdk ~0.3.278` (bun minimum-release-age blocks newer) · `@trpc/server ^11.19.0` · `@trpc/client ^11.19.0` · `@tanstack/react-query ^5.103.2` · `react ^19.3.0` · `react-dom ^19.3.0` · `vite ^8.3.0` · `@vitejs/plugin-react ^6.1.1` · `tailwindcss ^4.3.3` · `@tailwindcss/vite ^4.3.3` · `typescript ~5.9.3` · `@types/bun ^1.4.2` · `@types/react ^19.3.0` · `@types/react-dom ^19.3.0`.

## Repo layout

```
sigil/
  package.json                 workspaces ["packages/*"], private
  tsconfig.base.json           strict, noUncheckedIndexedAccess, verbatimModuleSyntax, bundler resolution, ESNext
  packages/core/src/
    types.ts                   the shared types — Fable-owned
    color.ts                   parseCssColor — Fable-owned
    style.ts                   icon.md parse/serialize (zod + yaml)             [agent B]
    svg.ts                     icon SVG parse/serialize                          [agent B]
    lint.ts                    structural lint                                   [agent B]
    manifest.ts                icons/manifest.json read/write (zod)              [agent B]
    project.ts                 locate + load a consumer project                  [agent B]
    render.ts                  paintIcon / paintTile / renderPng / renderSheet   [agent C]
    raster.ts                  masks, components, iou, bbox                      [agent C]
    checks.ts                  legibility / collision / optical / keyline        [agent C]
    engine/runner.ts           ClaudeRunner interface + cli + sdk runners        [agent E]
    engine/prompt.ts           system.md template + round prompts               [agent E]
    engine/draw.ts             the orchestrated loop, batches, concurrency       [agent E]
    engine/directions.ts       init: 5 drafts, mix, iterate                      [agent E]
    engine/cache.ts            content-hash cache                                [agent E]
    build.ts                   react / css / sprite / flat / sheet outputs       [agent F]
    index.ts                   re-exports
  packages/cli/src/main.ts     citty commands                                    [agent G]
  packages/lab/server/         Bun + tRPC server                                 [agent H]
  packages/lab/src/            React app                                          [agent I]
  fixtures/frozone/            icon.md, icons/manifest.json, icons/src/*.svg     [agent D]
  scripts/convert-frozone.ts   glyph .ts → icons/src/*.svg                       [agent D]
  skills/sigil/SKILL.md        the /sigil skill (M5)
```

## Consumer project layout

```
icon.md                      style bible (frontmatter + prose)
icons/manifest.json          { "<name>": { "brief": "…", "group"?: "…", "lucide"?: "ShoppingCart", "approved"?: true } }
icons/src/<name>.svg         sources (role groups, no colour)
icons/dist/                  build output (react/, icons.css, sprite.svg, flat/<tone>/<name>.svg, sheet.html, sheet.png)
.sigil/config.json           optional { "model"?: string, "concurrency"?: number, "port"?: number, "engine"?: "cli" | "sdk" }
.sigil/cache/<name>.json     { key, svg, rationale, critique, rounds, costUsd, drawnAt }
.sigil/jobs/<jobId>/         brief.json, system.md, neighbours.png, round-N.png, round-N.json, result.json, log.jsonl
.sigil/directions/<id>/      icon.md, meta.json { letter, parent, note, createdAt }, icons/<name>.svg
```

## icon.md

Frontmatter YAML (snake_case), then markdown prose (the taste: Voice / Drawing rules / Vocabulary / Never). The prose is sent to the model verbatim.

```yaml
sigil: 1
grid: 32
keyline: [3, 29]
stroke: 2
caps: round            # round | butt | square
joins: round           # round | miter | bevel
radius: { sheet: 3, box: 2, bar: 1.2 }          # named corner radii, free keys
optical: { circle: 24, square: 22, tall: 25, wide: 25 }
roles: [plane, line, dot]                        # subset of plane|line|dot|accent, in any order
tones:
  tile:    { bg: { angle: 160, stops: ["#A12A4C 0%", "#7C1936 55%", "#62122B 100%"] }, line: "#FFFFFF", plane: "rgba(255,255,255,.26)", radius: "27%", scale: 0.6, shadow: "0 4px 10px rgba(98,18,43,.16)" }
  inline:  { line: "#8A1E3D", plane: "#EDB9C8", on: "#FFFFFF" }
  on-dark: { line: "rgba(255,255,255,.88)", plane: "rgba(255,255,255,.2)", on: "#0F1F3A" }
detail_budget: { inner_marks: [2, 5], min_gap: 2.5, min_px: 16 }
checks: { max_ink_16: 0.35, collision_iou: 0.88, collision_body: 0.85, optical_tolerance: 3 }  # optional, these are the defaults
references: [forms, point-of-sale, pro-shop, orders, discounts, at-risk]
```

Rules: `bg` present ⇒ tile tone (glyph drawn inside a rounded box of `radius`, at `scale` × box; `scale` default 0.6). `bg` is a colour string or `{ angle, stops }` where each stop is `"<colour>"` or `"<colour> <pct>%"`; missing percentages are spread evenly. `on` = the surface the tone sits on (default `#FFFFFF`; for tile tones the bg is the surface). `accent` colour required on a tone iff `accent` ∈ roles. Colours must parse with `parseCssColor` (hex 3/4/6/8, `rgb()`, `rgba()`); anything else is a parse error. `hash` = sha256 hex of the raw file. Defaults when a key is missing: grid 32, keyline [3, 29], stroke 2, caps/joins round, radius {}, optical {24,22,25,25}, roles [plane,line,dot], detail_budget {[2,5], 2.5, 16}, references [].

## Icon SVG source (canonical form)

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" data-sigil="1" data-brief="the batting helmet an athlete wears">
  <g data-role="plane"><path d="M…"/></g>
  <g data-role="line"><path d="M…"/><circle cx="12.5" cy="10.5" r="5.5"/></g>
  <g data-role="plane"><path d="M…"/></g>
  <g data-role="dot"><circle cx="23.6" cy="25.6" r="1.15"/></g>
</svg>
```

- Any number of `<g data-role>` groups, **paint order = document order** (Frozone's at-risk badge is plane, line, plane, line, dot). A group may not be empty.
- Elements: `path(d)`, `circle(cx,cy,r)`, `rect(x,y,width,height[,rx])`, `line(x1,y1,x2,y2)`, `polyline(points)`. No other elements or attributes (no fill/stroke/style/class/id/transform/ry). XML comments and the `<?xml …?>` prolog are allowed and dropped. Whitespace between elements is free.
- Serializer: 2-space indent, one group per line, attributes in the order shown, numbers trimmed (`1.15`, `12`, never `12.0`; max 3 decimals), `data-brief` XML-escaped, `data-brief` omitted when empty. `parse(serialize(icon))` deep-equals `icon`.
- Name = filename stem, kebab-case `^[a-z0-9]+(-[a-z0-9]+)*$`.

## Shared types

`packages/core/src/types.ts` is the source of truth. `IconStyle` is the camelCase parsed form; `Finding.rule` ids are listed below; `Result<T>` is `{ ok: true; value: T } | { ok: false; findings: Finding[] }`.

## Findings — rule ids

Structural lint (`lint.ts`, no rasterising): `schema.parse` (error, from the parser), `schema.role` (error: role not in style.roles), `schema.viewbox` (error: viewBox ≠ `0 0 grid grid`), `schema.empty` (error: no layers or an empty group), `schema.element` (error), `schema.attr` (error), `schema.name` (error), `grid.half` (warn: a coordinate off the 0.5 grid; checks rect x/y/width/height, circle cx/cy, line ends, polyline points, path absolute M/L/H/V numbers only; skip curves, arcs, relative commands, radii), `budget.marks` (warn: count of shapes across line+dot groups minus 1 is outside `inner_marks`; the first line shape is the outline).

Raster checks (`checks.ts`): `keyline` (warn: resvg bbox of the icon painted at grid scale lies outside `[keyline[0]-0.5, keyline[1]+0.5]`), `legibility.ink` (error: ink coverage of the line+dot roles rasterised at `min_px` > `max_ink_16`; planes are legitimate mass and are not counted), `legibility.gap` (warn: rendering line+dot layers at 4× grid with stroke = `min_gap` has fewer connected components than with stroke = `stroke`, meaning strokes closer than min_gap), `legibility.island` (warn: connected components at `min_px` < components at 4× grid), `collision` (warn, two signals, either trips: raw IoU of the 24px all-roles masks ≥ `collision_iou`, OR IoU of the bbox-normalised (crop to ink bbox, nearest-neighbour resample to 24×24, from a 96px source) plane-role masks ≥ `collision_body`, the body-silhouette signal that catches the three-houses bug; `related: [other]`, message names which signal; reported once per pair on the lexically first name), `optical` (warn: ink bbox vs target; aspect h/w > 1.15 ⇒ `tall` on height, w/h > 1.15 ⇒ `wide` on width, else a corner test on the union mask at 4× grid: a corner region is the 15%×15% square of the ink bbox at each corner, inked if any set pixel lies in it; ≥3 inked corners ⇒ `square` else `circle`, both on max(w,h); flag when |actual − target| > `optical_tolerance`, in grid units).

## Render

- `paintIcon(icon, style, tone, opts?)` → standalone SVG string (`xmlns`, viewBox 0 0 grid grid, optional width/height). Role groups get inline paint: plane `fill` (+`fill-opacity`) and `stroke="none"`; line `fill="none" stroke stroke-width={style.stroke} stroke-linecap={caps} stroke-linejoin={joins}` (+`stroke-opacity`); dot `fill` = line colour; accent `fill` = accent colour. Opts: `strokeWidth` override, `roles` subset, `color` override (every role painted one flat opaque colour, for masks).
- `paintTile(icon, style, tone, sizePx)` → SVG of a `size×size` rounded rect (`radius` CSS `%` or `px` → user units; gradient via `<linearGradient>` with x1/y1/x2/y2 derived from `angle` using the CSS convention: 0deg = bottom→top, 90deg = left→right, 180deg = top→bottom) with the glyph centred at `scale × size`. `shadow` is CSS-only, not rendered.
- `renderPng(svg, widthPx)` → `Uint8Array` via resvg (`fitTo: { mode: 'width', value }`, `font: { loadSystemFonts: true }`).
- `renderSheet({ rows: { icon, label }[], style, title? })` → `{ svg, png, width, height }`: one composed SVG (nested `<svg x y width height viewBox>` cells) rasterised once at 1×. Row: label column 150px (13px monospace) · 128px cell of the first non-bg tone on a 16px grid background over its `on` colour · per bg tone: 64 and 44 tiles · per non-bg tone: 24, 20, 16 on its `on` colour (a 40px-tall pill) · row height 144, gap 16, page padding 24, background `#F3F5F8`. A `title` renders as a 16px bold line above the rows. Pixel sizes are true sizes: the model must see real 16px.

## Manifest

`icons/manifest.json` — zod-validated `Record<name, ManifestEntry>`; `readManifest(dir)` returns `{}` when absent; `writeManifest(dir, m)` sorts keys, 2-space JSON, trailing newline.

## Engine (agent E)

- `ClaudeRunner.run(job: ClaudeJob, onEvent?)`: `ClaudeJob { cwd, prompt, systemPromptFile, allowedTools: string[], model: string, maxTurns: number, jsonSchema?: Record<string, unknown>, resume?: string, maxBudgetUsd?: number }` → `ClaudeResult { ok, text, structured: unknown, sessionId, costUsd, durationMs, numTurns, raw: unknown }`. `cliRunner` spawns `claude -p <prompt> --output-format json --model … --allowedTools … --append-system-prompt-file … --max-turns … --permission-mode dontAsk [--json-schema …] [--resume …] [--max-budget-usd …]` with `stdin: 'ignore'`, parses stdout with a zod schema (`is_error`, `result`, `structured_output?`, `session_id`, `total_cost_usd`, `duration_ms`, `num_turns`). `sdkRunner` uses `query()` from the Agent SDK with the same options. `resolveRunner(config)` picks by `engine` (default `cli`).
- Draw loop per batch (≤10 icons; `sigil draw` splits names into batches; ≤`concurrency` batches in flight, default 3):
  1. Job dir `.sigil/jobs/<id>/`; write `system.md` (template filled from style), `brief.json`, `neighbours.png` (sheet of the reference icons + existing icons in the same groups), `neighbours.txt` (names).
  2. Round 1 prompt: draw. Structured schema: `{ icons: [{ name, svg, rationale }] }`.
  3. Orchestrator: parse + lint + checks; write `round-1.json` (findings) and `round-1.png` (sheet: reference rows first, then drafts, title `Round 1`). Icons with `schema.*` errors get the lint messages back verbatim.
  4. Round n≥2 (resume): "Read `round-(n-1).png` … findings … For each icon return `{ name, pass: boolean, critique, svg? }`", `svg` required when `pass` is false. Stop when every icon passes with zero `error` findings, or after `maxRounds` (default 4; icons still failing are kept with their last svg and `status: 'unresolved'`).
  5. Persist: `icons/src/<name>.svg` (serialized canonical, brief embedded), `.sigil/cache/<name>.json`, `result.json` in the job dir. Cache key = sha256(style.hash + name + brief + sorted reference svgs). `sigil draw` skips an icon whose src exists and cache key matches unless `--force`.
- `JobEvent` = `{ type: 'round', round, icon?, message }` | `{ type: 'done' }` | `{ type: 'error', message }`, appended to `log.jsonl`.

- Directions samples (2026-09-25 calibration): the first 6 names (`SAMPLE_CAP`), at most 2 rounds (`SAMPLE_ROUNDS`), the five directions drawn concurrently through one semaphore of `concurrency`. Serial × 10 icons × 4 rounds had cost 7 min and $5 per direction. Full-quality draws come later via `sigil draw`.

## Lab tRPC contract (agents H and I)

Router `appRouter` in `packages/lab/server/router.ts`; type exported as `AppRouter`. All procedures are `publicProcedure`; inputs are zod. Shapes:

```ts
project.get:        () => { root: string; hasStyle: boolean; style: IconStyle | null; styleFindings: Finding[]; manifest: Manifest; icons: IconRow[]; config: ProjectConfig }
                    IconRow = { name: string; brief: string; group?: string; svg: string | null; findings: Finding[]; cache: CacheEntry | null; approved: boolean }
project.setBrief:   ({ name, brief, group? }) => IconRow
icons.draw:         ({ names: string[]; force?: boolean }) => { started: number }     // runs in the background; poll jobs.list
icons.redraw:       ({ name: string; note: string }) => { started: number }          // note appended to the brief for this job only, force: true
icons.approve:      ({ name: string; approved: boolean }) => IconRow
jobs.list:          () => JobRecord[]                                                 // from engine/jobs listJobs, newest first
jobs.get:           ({ id }) => JobDetail    JobDetail = JobRecord & { rounds: { round: number; png: string /* /files/jobs/<id>/round-N.png */; findings: Finding[]; critiques: Record<string, string>; icons: Record<string, string> }[]; log: JobEvent[]; result: DrawOutcome[] | null }
tasks.list:         () => Task[]             Task = { id: string; label: string; status: 'running' | 'done' | 'error'; error?: string; startedAt: string; finishedAt?: string }   // background work not tied to a job (e.g. the sync part of mix)
directions.list:    () => Direction[]        // engine/directions listDirections (style parsed, samples inline)
directions.generate:({ names: string[]; product: string; brand?: string; hints?: string }) => { started: true }
directions.mix:     ({ line: string; tone: string; radius: string; prose: string }) => { started: true }   // direction ids; validated synchronously (TRPCError NOT_FOUND on a bad id), then runs in the background
directions.iterate: ({ id: string; note: string }) => { started: true }
directions.pick:    ({ id: string }) => { styleFile: string; written: string[]; build: { files: string[] } }   // synchronous: pickDirection then buildProject
build.run:          () => { files: string[]; iconCount: number; findings: Finding[] }
```

Every mutation that calls Claude returns immediately with `{ started }` and does the work in a background task; the UI polls `jobs.list` (1.5s while anything is running, 10s otherwise), `directions.list` and `tasks.list`. Errors inside a job land in the job's `status: 'error'` + `error`; errors before a job exists land in `tasks.list`.

`/files/<relative-path-under-.sigil>` serves PNGs. Server: `Bun.serve({ port })`, `fetchRequestHandler` for `/trpc`, static `packages/lab/dist` for everything else (in dev, Vite serves the app and proxies).

## Code style

Strict TS, no `any`, no `as` casts except `as const`, `unknown` + zod at every boundary (file, JSON, process output). Comments only for constraints and non-obvious intent. ESM, named exports, `node:` imports, Bun APIs allowed in cli/lab/engine (`Bun.spawn`, `Bun.serve`) but core parse/render/lint stay runtime-neutral (node:fs only).
