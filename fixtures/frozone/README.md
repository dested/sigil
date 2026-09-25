# Frozone fixture

A complete Sigil consumer project built from the 45 hand-reviewed tool icons in frozenropes: `icon.md`, `icons/manifest.json` and `icons/src/*.svg`.
The SVGs are generated from the frozenropes glyph modules. Regenerate them with `bun scripts/convert-frozone.ts` from the repo root (briefs come from the manifest).
frozenropes (`apps/web/src/components/icons/glyphs/`) stays the source of truth for the drawings until M5; edit there, not here.
