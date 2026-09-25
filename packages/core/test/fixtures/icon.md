---
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
checks: { max_ink_16: 0.35, collision_iou: 0.88, collision_body: 0.85, optical_tolerance: 3 }   # optional, these are the defaults
references: [forms, point-of-sale, pro-shop, orders, discounts, at-risk]
---
# Icon style

Frozone icons are sturdy, friendly objects drawn with one confident outline and a soft tinted plane behind it.

## Voice

Warm, practical, a little sporty. Objects, not abstractions.

## Drawing rules

- One 2px outline per object, round caps and joins.
- The plane is an offset silhouette that sits behind the outline.
- Dots mark a single point of interest.

## Vocabulary

Carts, clipboards, tags, helmets, ropes.

## Never

- No text or numerals inside an icon.
- No perspective or 3D.
