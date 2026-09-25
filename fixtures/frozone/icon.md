---
sigil: 1
grid: 32
keyline: [3, 29]
stroke: 2
caps: round
joins: round
radius: { sheet: 3, box: 2, bar: 1.2 }
optical: { circle: 24, square: 22, tall: 25, wide: 25 }
roles: [plane, line, dot]
tones:
  tile:
    bg: { angle: 160, stops: ["#A12A4C 0%", "#7C1936 55%", "#62122B 100%"] }
    line: "#FFFFFF"
    plane: "rgba(255,255,255,.26)"
    radius: "27%"
    scale: 0.6
    shadow: "0 1px 1px rgba(98,18,43,.25), 0 4px 10px rgba(98,18,43,.16), inset 0 1px 0 rgba(255,255,255,.18)"
  inline: { line: "#8A1E3D", plane: "#EDB9C8", on: "#FFFFFF" }
  on-dark: { line: "rgba(255,255,255,.88)", plane: "rgba(255,255,255,.2)", on: "#0F1F3A" }
detail_budget: { inner_marks: [2, 5], min_gap: 2.5, min_px: 16 }
references: [forms, flyer-studio, at-risk, reports, point-of-sale, pro-shop, orders, discounts, expenses, tasks, closeout, card-readers]
---

# Icon style

## Voice

These are the icons of Frozen Ropes' operating system: the software a baseball and softball training facility runs on, from the front desk to the cages to the GM's office. Each icon is a sturdy, two-colour object that someone who works in the building would recognise on sight: a jersey, a receipt, a card terminal, a batting helmet. They are friendly but not cute, solid but not heavy, and they belong to the GM's building rather than to a generic SaaS dashboard. The plane is the object's body, one calm mass of the second colour. The line carries every detail on top of it.

## Drawing rules

1. Draw the real object of the tool, the thing a GM would recognise from their building, never a generic document with a symbol on it.
2. Baseball and softball vernacular (helmet, diamond, cage lane) is welcome only where it is the honest subject, never as decoration.
3. The plane is one clear mass (the sheet, the tag, the calendar tile), never confetti; lines sit on it and may leave it.
4. Planes never carry a stroke or any detail; all detail lives in the line layer, and small solid marks are dots in the line colour.
5. A badge (like the at-risk warning triangle) is its own plane and line, painted after the main object.
6. Centre the visual mass, not the bounding box.
7. Every detail must survive 16px inline and 20px on dark; if it vanishes at 16px, cut it; if two strokes sit closer than the minimum gap, move them apart.
8. Coordinates sit on the half-grid so strokes land crisp; corner radii follow the family (sheet, box, bar).
9. Two icons in the same group must not share a silhouette; check each new icon against the whole set on the sheet.

## Vocabulary

- **Batting helmet:** the athletes themselves, the roster.
- **Cage lane / tunnel:** booking and renting hitting space.
- **Diamond:** field play, practice stations, bases.
- **Jersey:** the pro shop and team merchandise.
- **Receipt:** an order or a completed sale.
- **Card terminal:** taking payments at the desk.
- **Outfield-fence banner:** local sponsors and sponsorships.
- **Postcard:** direct mail sent to the neighbourhood.
- **Flyer rack:** printed flyers handed out at the front.
- **Binder:** SOPs and operating procedures.
- **Kanban board:** a pipeline of leads or work.
- **Gauge:** performance improving, a facility level-up.
- **Whistle:** coaching, running a practice.
- **Clipboard:** forms, evaluations, practice plans.
- **Scoreboard:** results and standings from games.
- **Ticket:** admission to an event or camp.
- **Bat:** hitting lessons and hitting programs.
- **Glove:** fielding work and defensive training.
- **Tee:** beginner hitting and youth instruction.
- **Calendar tile:** a schedule of dated programs.

## Never

- A generic document, sheet or folder with a symbol stamped on it.
- Text, letters or numbers, except when the number is the object (the jersey's number).
- Arrows, unless motion is the meaning (the trend on Reports).
- A third colour: the tone decides colour, the drawing only decides shape.
- Category colours or per-icon tints.
- Decorative baseball: a ball, bat or diamond added to an icon whose subject is something else.
- Icons that share a silhouette with a neighbour. Today, households and boost once all read as three houses on the same row; each needed its own object.
