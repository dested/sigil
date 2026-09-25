---
sigil: 1
grid: 32
keyline: [3, 29]
stroke: 2
caps: round
joins: round
radius: { sheet: 5, box: 3.5, bar: 2, peel: 6 }
optical: { circle: 25, square: 23, tall: 26, wide: 26 }
roles: [plane, line, dot, accent]
tones:
  tile:    { bg: { angle: 180, stops: ["#A6DBF7 0%", "#A6DBF7 100%"] }, line: "#1E4E7A", plane: "#FFFFFF", accent: "#FFD23F", radius: "32%", scale: 0.64 }
  inline:  { line: "#1E4E7A", plane: "#D6EEFB", accent: "#FFC928", on: "#FFFFFF" }
  on-dark: { line: "#FFFFFF", plane: "rgba(166,219,247,.35)", accent: "#FFD23F", on: "#12233B" }
detail_budget: { inner_marks: [1, 3], min_gap: 3, min_px: 18 }
references: []
---

# Icon style

## Voice

Every icon is a puffy vinyl sticker slapped onto a sky-blue sheet: white die-cut bodies, one bright yellow highlight, a deep navy outline. Clean, bouncy and collectible, the kind of thing a kid wants to peel off the screen and put on their lunchbox.

## Drawing rules

1. The object is a white plane with a 2 navy outline; the plane itself reads as the sticker backing.
2. Exactly one part of each object is painted in accent yellow, the part a kid would colour first.
3. Silhouettes are simplified until they could be cut with safety scissors in one pass; no concave notches under 3 units.
4. Corners use `sheet` or `box` radius; the peel curl on the stickers icon uses `peel`.
5. Inner marks are one to three short navy strokes; details beyond that are dropped, not shrunk.
6. Dots are 2-unit navy discs for knobs, keyholes and magnets.
7. No object touches another; separate parts float with a 2.5 gap like two stickers side by side.

## Vocabulary

- Rounded house with a yellow door and a smoke puff: home.
- Fat crayon with a yellow body and white wrapper: new-sketch.
- Scrapbook with a yellow doodle tab poking out: my-drawings.
- Open picture book with a yellow bookmark ribbon: storybook.
- Page with a star, the star's left half filled yellow: coloring-pages.
- Open crayon box with one yellow crayon standing tallest: crayon-box.
- Yellow star sticker with its corner peeling to show white back: stickers, the house signature.
- Block eraser with a yellow sleeve: eraser.
- Fridge door with a yellow round magnet on a drawing: fridge-gallery.
- Padlock with a yellow key: grown-ups.

## Never

- Two accent areas in one icon; yellow is a spotlight, not a fill colour.
- Drop shadows, glossy highlights or bevels; the sticker is flat.
- Hairline details or text on the objects.
- Transparent or tinted bodies in the tile tone; the plane is solid white there.
- Shapes that could not survive being cut out of paper.
