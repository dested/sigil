---
sigil: 1
grid: 32
keyline: [3, 29]
stroke: 2.5
caps: round
joins: round
radius: { sheet: 4, box: 3, bar: 1.5, tip: 2 }
optical: { circle: 24, square: 22, tall: 25, wide: 25 }
roles: [plane, line, dot]
tones:
  tile:    { bg: { angle: 160, stops: ["#FFE15A 0%", "#FFB320 100%"] }, line: "#4A2E0E", plane: "rgba(255,255,255,.6)", radius: "30%", scale: 0.62 }
  inline:  { line: "#5A3A10", plane: "#FFE27A", on: "#FFFFFF" }
  on-dark: { line: "#FFE27A", plane: "rgba(255,226,122,.28)", on: "#1B2A44" }
detail_budget: { inner_marks: [2, 4], min_gap: 3, min_px: 20 }
references: []
---

# Icon style

## Voice

Fat, friendly and a little bit clumsy on purpose, like the first thing a five-year-old draws with a brand-new jumbo crayon. Heavy brown outlines, sunny yellow bodies, everything rounded until it looks squeezable. Warm, loud, confident; the icons should feel like they could be picked up with a small fist.

## Drawing rules

1. Every object is a filled plane with the 2.5 outline drawn around it; no bare-line objects except the smoke curl and motion hints.
2. Corners never go below radius 1.5; if a real object is sharp (crayon tip, star point), round it with `tip`.
3. Proportions are toddler-scaled: bodies squat and wide, roughly 1.2× wider than a realistic drawing would be.
4. Interior detail is at most four marks, drawn as short line strokes or single dots, never hatching.
5. Dots are 2.5–3 unit discs and used for knobs, magnets, keyholes and sparkle, never for texture.
6. Tilt objects that are held (crayon, eraser, key) 20–30° clockwise so they read as in use.
7. Overlaps are shown by a full 2.5 gap in the back object's outline, not by transparency.

## Vocabulary

- House with a chimney and one smoke curl: home, the only place a curl appears.
- Jumbo crayon with paper wrapper band and rounded tip: new-sketch, and any "start drawing" action.
- Scrapbook with a doodle page sticking out the top: my-drawings, saved work.
- Open picture book with two curved pages: storybook, turning drawings into tales.
- Colouring sheet with a star half filled in plane: coloring-pages.
- Open crayon box with three crayon tips peeking out: crayon-box, colours and tools.
- Star sticker with one corner peeled back: stickers.
- Block eraser with a wrapper sleeve: eraser, undo-by-rubbing.
- Fridge door with a round magnet pinning a drawing: fridge-gallery, sharing.
- Padlock with a key beside it: grown-ups, parent-gated settings.

## Never

- Thin, precise, product-UI lines; if it looks like a settings icon from a bank app, it is wrong.
- Sharp corners or miter joins anywhere.
- More than one smoke curl, sparkle or motion mark per icon.
- Gradients or shading inside the glyph; the tile gradient is the only gradient.
- White line on the yellow tile; contrast lives in the brown line.
