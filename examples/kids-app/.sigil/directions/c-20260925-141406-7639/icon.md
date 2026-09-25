---
sigil: 1
grid: 32
keyline: [3, 29]
stroke: 1.75
caps: round
joins: round
radius: { sheet: 2, box: 1.5, bar: 1 }
optical: { circle: 24, square: 22, tall: 25, wide: 25 }
roles: [line, dot, plane]
tones:
  tile:    { bg: { angle: 170, stops: ["#FFF8E1 0%", "#FDEBB8 100%"] }, line: "#2B6CB0", plane: "rgba(255,210,63,.5)", radius: "24%", scale: 0.66 }
  inline:  { line: "#2B6CB0", plane: "#FFE680", on: "#FFFFFF" }
  on-dark: { line: "#CFE9FF", plane: "rgba(255,214,90,.32)", on: "#162238" }
detail_budget: { inner_marks: [3, 6], min_gap: 2.5, min_px: 16 }
references: []
---

# Icon style

## Voice

Hand-drawn in blue crayon on cream paper, then scribble-coloured in yellow without staying inside the lines. Loose, wiggly, delighted; the icons look like the kid drew them, which is the whole promise of ScribbleTale. Charm comes from imperfection that is carefully controlled.

## Drawing rules

1. Objects are drawn as outline first; the line carries the drawing and the plane is a supporting colour.
2. Every long path wobbles: offset control points 0.3–0.6 units off true so no edge is perfectly straight.
3. Closed shapes do not quite close; start and end overshoot or stop short by about 0.8 units.
4. The yellow plane is offset 0.8–1.2 units from its outline, like colour that slipped outside the lines.
5. Plane appears on one region per icon at most; the rest stays paper.
6. Dots are 2-unit blobs, slightly egg-shaped, for smoke puffs, knobs and sparkle.
7. Wobble never breaks readability at 16 px; if a jitter makes the silhouette ambiguous, straighten it.

## Vocabulary

- Lopsided crayon house with a spiral smoke curl: home.
- Fat crayon with scribbled wrapper lines and a yellow body: new-sketch.
- Scrapbook with a squiggly doodle sticking out: my-drawings.
- Open picture book with a little stick-figure on one page: storybook.
- Page with a star half scribbled in yellow: coloring-pages, where the off-register fill is literal.
- Open crayon box with uneven crayon tips: crayon-box.
- Star sticker curling at one point: stickers.
- Block eraser with little crumb dots trailing behind: eraser.
- Fridge with a wobbly drawing held by a dot magnet: fridge-gallery.
- Padlock with a key on a loopy string: grown-ups.

## Never

- Geometric perfection: true circles, perfectly parallel lines, mechanical symmetry.
- Wobble so strong it reads as a rendering glitch or a shaky hand tremor.
- Filling whole objects yellow; the scribble fill is a highlight.
- Pencil-grey or black line; the crayon is always blue.
- Scratchy texture or hatching that turns to mush at small sizes.
