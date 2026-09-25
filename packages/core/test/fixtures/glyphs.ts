import type { Icon, IconStyle, Layer, Shape } from '../../src/types'

export const FROZONE_STYLE: IconStyle = {
  sigil: 1,
  grid: 32,
  keyline: [3, 29],
  stroke: 2,
  caps: 'round',
  joins: 'round',
  radius: { sheet: 3, box: 2, bar: 1.2 },
  optical: { circle: 24, square: 22, tall: 25, wide: 25 },
  roles: ['plane', 'line', 'dot'],
  tones: {
    tile: {
      bg: { angle: 160, stops: ['#A12A4C 0%', '#7C1936 55%', '#62122B 100%'] },
      line: '#FFFFFF',
      plane: 'rgba(255,255,255,.26)',
      on: '#FFFFFF',
      radius: '27%',
      scale: 0.6,
      shadow: '0 4px 10px rgba(98,18,43,.16)',
    },
    inline: { line: '#8A1E3D', plane: '#EDB9C8', on: '#FFFFFF', scale: 0.6 },
    'on-dark': { line: 'rgba(255,255,255,.88)', plane: 'rgba(255,255,255,.2)', on: '#0F1F3A', scale: 0.6 },
  },
  detailBudget: { innerMarks: [2, 5], minGap: 2.5, minPx: 16 },
  checks: { maxInk16: 0.35, collisionIou: 0.8, collisionBody: 0.85, opticalTolerance: 3 },
  references: [],
  body: '',
  raw: '',
  hash: 'test',
}

const path = (d: string): Shape => ({ kind: 'path', d })
const circle = (cx: number, cy: number, r: number): Shape => ({ kind: 'circle', cx, cy, r })
const rect = (x: number, y: number, width: number, height: number, rx: number): Shape => ({
  kind: 'rect',
  x,
  y,
  width,
  height,
  rx,
})
const line = (x1: number, y1: number, x2: number, y2: number): Shape => ({ kind: 'line', x1, y1, x2, y2 })

const plane = (...shapes: Shape[]): Layer => ({ role: 'plane', shapes })
const stroke = (...shapes: Shape[]): Layer => ({ role: 'line', shapes })
const dot = (...shapes: Shape[]): Layer => ({ role: 'dot', shapes })

const icon = (name: string, ...layers: Layer[]): Icon => ({ name, brief: '', grid: 32, layers })

export const today = icon(
  'today',
  plane(path('M8.5 21a7.5 7.5 0 0 1 15 0z')),
  stroke(path('M8.5 21a7.5 7.5 0 0 1 15 0'), path('M3.5 21h25')),
  stroke(path('M16 4.5V8M6 9l2.4 2.4M26 9l-2.4 2.4')),
  stroke(path('M8.5 26h15')),
)

const HOUSE =
  'M5.5 13.2v12.3a2 2 0 0 0 2 2h17a2 2 0 0 0 2-2V13.2a2 2 0 0 0-.8-1.6l-8.5-6.8a2 2 0 0 0-2.4 0l-8.5 6.8a2 2 0 0 0-.8 1.6z'

const householdLayers = [
  plane(path(HOUSE)),
  stroke(path(HOUSE)),
  stroke(circle(12.8, 16, 2.3), path('M8.5 27.5v-.8a4.3 4.3 0 0 1 8.6 0v.8')),
  stroke(circle(20.2, 19.2, 1.8), path('M17.2 27.5a3 3 0 0 1 6 0')),
]

export const households = icon('households', ...householdLayers)
export const householdsTwin = icon('households-twin', ...householdLayers)

export const boost = icon(
  'boost',
  plane(path('M4.5 22.5a11.5 11.5 0 0 1 23 0z')),
  stroke(path('M4.5 22.5a11.5 11.5 0 0 1 23 0'), path('M3.5 26.5h25')),
  stroke(path('M8.2 15.1l1.7 1.2M12.2 12.2l.8 1.8M19.8 12.2l-.8 1.8M23.8 15.1l-1.7 1.2')),
  stroke(path('M16 22.5l6.4-7.6')),
  dot(circle(16, 22.5, 2.3)),
)

const TAG =
  'M4.5 6.5v8.3a2 2 0 0 0 .6 1.4l11.3 11.3a2 2 0 0 0 2.8 0l8.4-8.4a2 2 0 0 0 0-2.8L16.3 5.1a2 2 0 0 0-1.4-.6H6.5a2 2 0 0 0-2 2z'

export const discounts = icon(
  'discounts',
  plane(path(TAG)),
  stroke(path(TAG)),
  stroke(circle(10, 10, 1.7), path('M21 14.2l-6.8 6.8')),
  dot(circle(15, 15.2, 1.35), circle(20.2, 20.2, 1.35)),
)

export const box = icon('box', plane(rect(5, 5, 22, 22, 3)), stroke(rect(5, 5, 22, 22, 3)))

export const overflow = icon('overflow', stroke(rect(1, 1, 30, 30, 2)))

export const mush = icon(
  'mush',
  plane(rect(4, 4, 24, 24, 2)),
  stroke(...Array.from({ length: 10 }, (_, i) => line(6 + i * 2.25, 6, 6 + i * 2.25, 26))),
)

export const tinyDots = icon(
  'tiny-dots',
  stroke(rect(7, 7, 18, 18, 0)),
  dot(circle(9, 9, 0.4), circle(23, 23, 0.4)),
)

export const allShapes = icon(
  'all-shapes',
  plane(rect(6, 6, 20, 20, 2)),
  stroke(
    path('M6 6h20'),
    circle(16, 16, 5),
    rect(8, 8, 16, 16, 0),
    line(4, 16, 28, 16),
    { kind: 'polyline', points: [[4, 28], [16, 4], [28, 28]] },
  ),
  dot(circle(16, 16, 1.5)),
)

export const smallSquare = icon('small-square', plane(rect(10, 10, 12, 12, 2)), stroke(rect(10, 10, 12, 12, 2)))

export const bigCircle = icon('big-circle', plane(circle(16, 16, 8)), stroke(circle(16, 16, 8)))
