# Sigil lab visual language

The lab is a workbench, not a marketing page. Its job is to show the developer's own icons truthfully, at true pixel sizes, in the contexts they will live in, and to get out of the way. The product's tones are the only colour on the page; the chrome is neutral.

## Principles

- **The icons are the colour.** Chrome is warm grey and near-black. Never tint a panel, button or badge with the product's tones; only the icon cells carry them.
- **True sizes.** A 16px icon is rendered at 16px, never scaled. Zoom is a separate, explicit control (the 128px grid view).
- **Dense, quiet, monospace labels.** Icon names, rule ids and numbers are monospace. Prose is system sans.
- **State is visible.** Every icon shows its lint and check flags inline. Every job shows its round and cost. Nothing hides behind a hover.
- **No eyebrows, no trailing periods in headings.** A heading is the heading.

## Tokens

```
--bg:        #F3F5F8   page
--panel:     #FFFFFF   cards, rails
--panel-2:   #F8F9FB   nested surfaces, table stripes
--border:    #E2E6ED
--border-2:  #CBD2DC   hover / focus borders
--ink:       #1C1A1F   primary text
--ink-2:     #5B5F68   secondary text
--ink-3:     #8A8F99   placeholders, disabled
--accent:    #1C1A1F   buttons are ink, not brand
--ok:        #1F7A4D
--warn:      #B7791F
--error:     #B42318
--navy:      #0F1F3A   the dark tab-strip context (fixed, used only as a context surface)
--grid-line: #E9ECF1   the 16px grid behind the 128px view
```

Radii: 12px cards, 8px controls and pills, 6px chips. Shadows: none except the tile tone's own `shadow`. Borders do the work.

Type: `font-family: system-ui, -apple-system, 'Segoe UI', sans-serif` for prose, 14px/1.45 base; `ui-monospace, 'Cascadia Code', Consolas, monospace` for names, ids, numbers, 12.5px. Headings: 20px/600 page title, 15px/600 section titles. Only two heading levels on any screen.

## Layout

- Fixed top bar, 48px: `Sigil` wordmark (monospace, 600), the project root path (monospace, ink-2, truncated from the left), then tabs `Directions` · `Library` · `Jobs`, then a right-aligned cost meter (`$1.24 this session`, monospace).
- Content is a single column, max-width 1440px, 24px gutters, 16px on phone. Panels stack; no sidebar.
- Sticky action bar at the bottom of a view only when there is a primary action (Pick direction, Draw selected, Commit). 56px, panel background, top border.

## Components

**Icon cell** — the unit of every view. A 1px-bordered card, panel background, holding the icon in one tone at one size, with the size in monospace under it (`16`, `20`, `24`, `44`, `64`, `128`). The 128 cell has the 16px grid behind it. Tile tones render the real tile (radius, gradient, shadow from `icons.css`).

**Context strips** — the "in situ" previews, in this fixed order, each a horizontal strip labelled by its context name in monospace:
1. `grid tile`: three tiles at 44 with labels beneath, on the page background.
2. `sidebar row`: a 240px-wide panel with three rows (icon at 20 inline + label, 36px tall, the second row selected with `panel-2`).
3. `tab strip`: the navy surface, 40px tall, three tabs (icon at 20 in the on-dark tone + label, the first tab active with a 2px white underline).
4. `chip`: three pills (icon at 16 inline + label, 24px tall, `panel-2`, 6px radius).
If a style has no tile tone, skip strip 1; no dark tone (no tone with a dark `on`), skip strip 3.

**Flag chip** — `warn` amber outline, `error` red outline, monospace rule id, tooltip-free: the message is written next to it in ink-2.

**Direction column** — in the Directions view, one column per draft: letter + name as the heading (`A · Sturdy maroon`), the context strips for its sample icons, then a facet table (line: `2 round`, tone: swatches, radius: `3 / 2 / 1.2`, prose: first line of Voice), then a text box `Iterate` with a `Revise` button and a `Pick` button. Columns scroll horizontally on narrow screens; each column is 360px wide.

**Mix bar** — above the columns: four selects (`line`, `tone`, `radius`, `prose`) each listing the direction letters, and a `Mix` button. It reads as one sentence: "line from A · tone from C · radius from D · prose from A".

**Library grid** — a table, one row per icon: name (monospace), brief (editable inline on click), group, the row of cells (24 / 20 / 16 inline, 44 tile, 20 on-dark), flags, and actions (`Approve` toggle, `Redraw` opens a one-line note box). Rows with errors get a 3px left border in `--error`; unresolved (job gave up) in `--warn`. A checkbox column feeds `Draw selected`.

**Job drawer** — slides up from the bottom, 60vh, panel background, top border. Header: job id, names, status pill, round `2 / 4`, cost. Body: the round PNGs stacked newest first (real size, horizontally scrollable), each with its findings list and the model's critique per icon in ink-2. A `Log` tab shows `log.jsonl` lines in monospace.

**Buttons** — primary: ink background, white text, 8px radius, 32px tall, 12px horizontal padding. Secondary: panel background, border. Destructive-ish (Redraw, Discard): secondary with error text. Disabled: ink-3 text, panel-2 background.

**Empty states** — one sentence in ink-2 plus the single action that fixes it. Directions empty: "No directions yet. Pick the nav items to sample and generate five." with a name multi-select prefilled from the manifest. Library empty: "No icons drawn yet." with `Draw all`.

**Loading** — polling views never blank: keep the last data and show a 2px indeterminate bar under the top bar while a job is running. Buttons that start a job go disabled with a spinner glyph for the request only.

**Errors** — a red-outlined banner under the top bar with the message and a `Retry`. Never a toast.

## Responsive

Phone: top bar keeps wordmark + tabs, hides the path; columns become a horizontal scroller; the library table drops the brief and group columns; the job drawer becomes full height.
