# Updates

Terse task log, newest first.

## 2026-09-25 — Published to GitHub (board #205)

- Public repo https://github.com/dested/sigil: README with screenshots and real cost numbers, MIT license, `examples/kids-app` (a fresh project taken to a picked direction through the lab), `docs/` screenshots.
- Same day, after Sal's first clean-project test: Suggest icons + inline Add icons in the lab, `sigil scan`, parallel direction samples capped at six icons and two rounds, interrupted-job recovery on lab start, Debug tab with a live job feed, per-column Draw samples.

## 2026-09-25 — Founding build, M0–M3 plus scan (board #205)

- Monorepo scaffolded: `@sigil/core`, `sigil` CLI, `@sigil/lab`; strict TS 5.9, bun test, zod at every boundary.
- Core: icon.md parser, canonical role-group SVG format (paint order = document order), structural lint, resvg renderer + contact sheet, raster checks (ink, gap, island, optical corner test, two-signal collision calibrated on the 45 Frozone icons), build outputs (typed React, icons.css, sprite, flat, sheet).
- Engine: `ClaudeRunner` (headless `claude -p` + Agent SDK), orchestrated draw loop with `--resume` and PNG-in-the-loop, content-hash cache, directions generate/mix/iterate/pick, suggest-icons job.
- CLI: status, lint, check, render, build, draw, init, scan, lab. Linked globally with `bun link`.
- Lab: Bun + tRPC server (background tasks, `/files`), React app (Directions with generate/suggest/add-icons, mix, iterate, pick; Library with cells, grouped flags, zoom, approve, redraw; Jobs drawer with round PNGs and critiques).
- Fixture: Frozone's 45 icons converted to `fixtures/frozone` with icon.md + manifest; parser round-trips them byte-for-byte.
- Verified live: a two-icon draw (3 rounds, 87 s, $2.09) and a five-directions run on a fresh project (drafts $0.34, samples ≈ $1.2 per direction at two rounds).
- Open items: `sigil migrate` codemod (M4), `/sigil` skill + publish (M5), direction sample jobs run serially (parallelise), Frozone back-port.
