# Sigil

A custom icon system for Claude Code projects. A project stops using Lucide for its *tool* icons and instead keeps an `icon.md` style bible plus `icons/src/*.svg` sources; the `sigil` CLI draws new icons in that style with headless Claude Code (the developer's own auth), renders every round to a PNG the model reads, runs deterministic family checks, and builds typed React components, CSS tones, a sprite and flat SVGs. The lab is a local browser page where the developer picks a style direction, mixes and iterates it, and reviews icons.

Founding plan: `plans/2026-09-25-sigil.md`. Build contract (types, formats, rule ids, tRPC shapes): `plans/2026-09-25-sigil-architecture.md`. Settled choices: `decisions.md`. Lab look: `ui.md`.

## Stack

TypeScript (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), Bun workspaces, zod at every boundary, `@resvg/resvg-js` for raster, citty for the CLI, Bun + tRPC 11 for the lab server, Vite 8 + React 19 + Tailwind 4 for the lab UI. Tests with `bun test`. TypeScript pinned to 5.9. Bun enforces a three-day minimum release age on dependencies.

## Commands

```
bun install                      # workspace install
bun run typecheck                # tsc --noEmit in every package
bun test                         # all packages (core 126 tests, cli 23, lab 18)
bun run sigil -- <cmd>           # run the CLI from the repo root
bun run --filter @sigil/lab dev  # lab UI on http://localhost:7445 (proxies to the server on 7444)
bun run --filter @sigil/lab build
bun scripts/convert-frozone.ts   # regenerate fixtures/frozone from the frozenropes glyph files
```

CLI (run in a consumer project, or with `--cwd <dir>`): `sigil status` · `sigil lint [names]` · `sigil check [names]` · `sigil render [names] --out x.png` · `sigil build` · `sigil draw <names> [--brief …] [--note …] [--force]` · `sigil init [--names a,b] [--product …]` · `sigil scan [--write] [--all]` · `sigil lab [--port]`. Ports: lab server 7444, Vite dev 7445. Globally linked from this checkout via `bun link` in `packages/cli` (undo with `bun unlink`).

## Directory map

```
package.json / tsconfig.base.json     workspaces, shared strict TS config
packages/core/src/                    @sigil/core — runtime-neutral engine
  types.ts        shared types (Icon, Layer, Shape, IconStyle, ToneStyle, Finding, Result)
  color.ts        parseCssColor → rgb() + opacity (resvg-safe)
  style.ts        icon.md parse/serialize (yaml + zod), resolveGradientStops
  svg.ts          strict icon SVG parser + canonical serializer (role groups, paint order = document order)
  lint.ts         structural lint (schema.*, grid.half, budget.marks)
  manifest.ts     icons/manifest.json (name → brief, group, lucide, approved)
  project.ts      loadProject / loadIcons / writeIconSource; .sigil/config.json
  render.ts       paintIcon, paintTile, renderPng, renderSheet (the contact sheet the model reads)
  raster.ts       masks, connected components, IoU, bbox, normalizeMask
  checks.ts       keyline, legibility.ink/gap/island, optical, collision (two-signal)
  build.ts (+ build/react.ts, css.ts, sprite.ts, sheet.ts)   icons/dist outputs
  engine/runner.ts      ClaudeRunner: cliRunner (claude -p) and sdkRunner (Agent SDK)
  engine/prompt.ts      fills templates/system.md + directions.md; round prompts; JSON schemas
  engine/draw.ts        the orchestrated loop: draw → render → model reads PNG → revise, ≤ maxRounds
  engine/directions.ts  init flow: five drafts, mix, iterate, pick
  engine/jobs.ts        .sigil/jobs/<id>/ status.json + log.jsonl
  engine/cache.ts       .sigil/cache/<name>.json keyed by style hash + brief + references
  engine/suggest.ts     propose the icon list (names, briefs, groups) from a product description
  scan.ts               find lucide-react imports/usages, label them, propose manifest entries (utilities stay on Lucide)
  engine/templates/     system.md (the drawing brief), directions.md (five directions), suggest.md (icon list)
packages/core/test/                   bun tests; fixtures/glyphs.ts holds hand-typed test icons
packages/cli/src/                     sigil — citty CLI; commands/<name>.ts, commands/index.ts registry
packages/lab/server/                  Bun.serve + tRPC router (router.ts), tasks registry, static files, startLab
packages/lab/src/                     React app: App.tsx, views/ (Directions, Library, Jobs), components/, lib/glyph.ts
fixtures/frozone/                     a complete consumer project: icon.md, icons/manifest.json, 45 sources
scripts/convert-frozone.ts            glyph .ts → canonical SVG converter (reads G:/code/frozenropes)
skills/sigil/                         the /sigil Claude Code skill (M5, not yet written)
plans/                                dated working docs
```

## Consumer project layout

```
icon.md                  style bible: YAML frontmatter (grid, keyline, stroke, tones, detail_budget, checks, references) + prose (Voice, Drawing rules, Vocabulary, Never)
icons/manifest.json      { name: { brief, group?, lucide?, approved? } }
icons/src/<name>.svg     <g data-role="plane|line|dot|accent"> groups, no colour, any number in paint order
icons/dist/              react/ (Icon + per-icon components, IconName/IconTone unions), icons.css, sprite.svg, flat/<tone>/, sheet.html, sheet.png
.sigil/                  config.json, cache/, jobs/<id>/ (round-N.png, round-N.json, result.json), directions/<id>/
```

## How a draw works

1. `targetFromProject` resolves the reference icons (`icon.md` `references`) and the neighbours (same manifest group).
2. A job dir gets `system.md` (template filled from the style + the icon.md prose), `neighbours.png`.
3. Round 1: `claude -p` (Opus, tools: Read only, `--json-schema`) returns `{ icons: [{ name, svg, rationale }] }`.
4. Sigil parses, lints, runs family checks, renders `round-1.png` (references first, then drafts).
5. Round n: `--resume` the same session with the PNG path and findings; the model returns `{ name, pass, critique, svg? }`.
6. Stop when every icon passes with no `error` findings or after `maxRounds` (default 4; remaining icons are `unresolved`, last draft kept).
7. Sources written to `icons/src`, cache entries to `.sigil/cache`. `sigil build` regenerates `icons/dist`.

Verified live on 2026-09-25: two new icons, three rounds, 87 s, about $2.

## Routes (lab)

Hash routes only: `#directions`, `#library`, `#jobs`. Server: `/trpc/*` (tRPC), `/files/jobs/<id>/round-N.png` (job PNGs), everything else static from `packages/lab/dist`. The Directions empty state has three ways to get an icon list: type `name: brief` lines, **Suggest icons** (Claude proposes ten from the product description), or `sigil scan --write` beforehand for an existing codebase. The router is loaded at process start: restart `sigil lab` after server changes; the UI is static files, so a page reload picks up a new `vite build`.

## Gotchas

- The model never runs Sigil commands; the orchestrator drives the loop. Keep the allowed tools at `Read`.
- Run `claude -p` with stdin ignored or it waits three seconds for piped input.
- `--json-schema` output is in `structured_output`; `result` is the text form.
- Frozone's own icons breach the keyline and half-grid rules, so those are warnings; only `schema.*`, `legibility.ink` and `engine.*` are errors.
- Collision has two signals: raw IoU at 24 px (default 0.88) and body IoU on bbox-normalised plane masks (0.85, box-shaped bodies excluded). Capped at two findings per icon.
- Tones are CSS: never put colour in a source SVG; lint rejects `fill`/`stroke`.
- Direction samples are drafts: the first six names, two rounds, five directions in parallel (`concurrency`, default 3). Full-quality draws happen later with `sigil draw` (four rounds, references, neighbours).
