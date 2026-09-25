# Decisions

Settled choices. Never reverse one without flagging it.

## 2026-09-25 — Founding

- **Monorepo of packages** (`packages/core` = `@sigil/core`, `packages/cli` = `sigil`, `packages/lab` = `@sigil/lab`), bun workspaces. Consumers install only `sigil`. Sal chose this over a single package.
- **Roles capped at four**: `plane`, `line`, `dot`, `accent`. More roles is where families stop looking like families. Lint rejects anything else.
- **Lucide stays for utility glyphs** (chevrons, X, plus). Sigil draws *tool* icons. `migrate` (M4) keeps a keep-list.
- **Frozone's 45 icons are a fixture only** (`fixtures/frozone/`). frozenropes is untouched until M5 makes it the first customer.
- **Browser lab only, no Electron.** `sigil lab` serves a local page on `http://localhost:7444`; that is the whole UI. Sal confirmed an Electron shell is not wanted.
- **Headless `claude -p` is the engine**, using the developer's own Claude Code auth (subscription or key), behind a `ClaudeRunner` interface so the Agent SDK can swap in. Drawing model: Opus.
- **The draw loop is orchestrated by Sigil, not self-driven by the model.** The model returns SVGs as structured JSON; Sigil parses, lints, renders the PNG sheet and runs checks; the next round resumes the same session (`--resume`) with the PNG and findings. Every round's PNG and findings are on disk under `.sigil/jobs/<id>/`, so the lab can show them. Rationale: deterministic, cheaper tool surface (Read only), the machine checks are automatically in the loop.
- **Paint order = document order** in the SVG source; role groups may repeat (a badge is plane, line after the body). One group per role would have broken Frozone's at-risk icon.
- **Colour is never in a drawing.** Tones live in `icon.md`; `parseCssColor` converts everything to opaque `rgb()` plus a separate opacity, so resvg and CSS agree.
- **Ink coverage counts line+dot only** (planes are legitimate mass at 16px); default `max_ink_16` is 0.35. Optical shape classification uses a corner test (≥3 inked bbox corners ⇒ square), not fill ratio, which was inverted for filled rounded squares.
- **Tests with `bun test`, TypeScript pinned to 5.9** (7.x is the native port; not yet trusted here). Bun's three-day minimum-release-age gate applies to every dependency.
- **Lab port 7444**, Vite dev 7445. Never 3000.
- **Generated CSS/class prefix `sg-`.**
