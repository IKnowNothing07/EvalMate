import { describe, it, expect } from 'vitest'
import { monotoneSegments, curveCommands, type Pt } from '../src/ui/curve'
import { graphLevel, winPct, GRAPH_CP_SCALE } from '../src/core/eval'
const bez = (a: number, b: number, c: number, d: number, t: number) => (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t * t * c + t ** 3 * d
describe('monotone curve (no invented values)', () => {
  const pts: Pt[] = [0, 1, 2, 3, 4, 5, 6, 7].map((x, i) => ({ x: x * 10, y: [50, 52, 40, 41, 10, 12, 100, 20][i] }))
  const segs = monotoneSegments(pts)
  it('passes exactly through every data point', () => { segs.forEach((s, k) => { expect(s.p0).toEqual(pts[k]); expect(s.p3).toEqual(pts[k + 1]) }) })
  it('never leaves the y-range of its two end points (no overshoot)', () => {
    segs.forEach(s => { const lo = Math.min(s.p0.y, s.p3.y) - 1e-9, hi = Math.max(s.p0.y, s.p3.y) + 1e-9
      for (let t = 0; t <= 1; t += 0.02) { const y = bez(s.p0.y, s.c1.y, s.c2.y, s.p3.y, t); expect(y).toBeGreaterThanOrEqual(lo); expect(y).toBeLessThanOrEqual(hi) } })
  })
  it('x is monotone along each segment (a function of x, no loops)', () => { segs.forEach(s => { let prev = -Infinity; for (let t = 0; t <= 1; t += 0.05) { const x = bez(s.p0.x, s.c1.x, s.c2.x, s.p3.x, t); expect(x).toBeGreaterThanOrEqual(prev); prev = x } }) })
  it('tangents are continuous at nodes (no corners)', () => {
    for (let k = 1; k < segs.length; k++) { const a = segs[k - 1], b = segs[k]; const inT = (a.p3.y - a.c2.y) / (a.p3.x - a.c2.x), outT = (b.c1.y - b.p0.y) / (b.c1.x - b.p0.x); expect(inT).toBeCloseTo(outT, 6) }
  })
  it('turning points get a horizontal tangent (peaks stay at the true value)', () => { const s = segs[1], t = segs[2]; expect(s.c2.y).toBeCloseTo(s.p3.y, 9); expect(t.c1.y).toBeCloseTo(t.p0.y, 9) })
  it('handles 0, 1, 2 points and flat runs without NaN', () => {
    expect(curveCommands([])).toBe(''); expect(curveCommands([{ x: 0, y: 5 }])).toBe('')
    expect(curveCommands([{ x: 0, y: 5 }, { x: 10, y: 9 }])).toMatch(/^C/)
    expect(curveCommands([0, 1, 2, 3].map(i => ({ x: i * 5, y: 30 })))).not.toMatch(/NaN/)
  })
})
describe('graph visual scale (never affects data)', () => {
  it('is symmetric, monotone, bounded', () => { expect(graphLevel(0)).toBeCloseTo(50); expect(graphLevel(300) + graphLevel(-300)).toBeCloseTo(100); expect(graphLevel(100)).toBeLessThan(graphLevel(200)); expect(graphLevel(10000)).toBeLessThanOrEqual(100); expect(graphLevel(-10000)).toBeGreaterThanOrEqual(0) })
  it('is gentler than the win% scale used for the bar and for classification', () => { expect(GRAPH_CP_SCALE).toBeLessThan(1); expect(Math.abs(graphLevel(300) - 50)).toBeLessThan(Math.abs(winPct(300) - 50)) })
  it('keeps mate at the extreme', () => expect(graphLevel(9997)).toBeGreaterThan(99.9))
})
import { knightTour, bounce } from '../src/ui/knightTour'
describe('loading page knight tour', () => {
  const t = knightTour()
  it('visits all 64 squares exactly once, every step a knight move', () => {
    expect(new Set(t.map(([x, y]) => y * 8 + x)).size).toBe(64)
    for (let i = 1; i < 64; i++) { const dx = Math.abs(t[i][0] - t[i - 1][0]), dy = Math.abs(t[i][1] - t[i - 1][1]); expect([dx, dy].sort().join()).toBe('1,2') }
  })
  it('bounce walks forward then backward with no jumps, forever', () => {
    for (let i = 0; i < 400; i++) { const a = bounce(i), b = bounce(i + 1); expect(Math.abs(a - b)).toBe(1); expect(a).toBeGreaterThanOrEqual(0); expect(a).toBeLessThanOrEqual(63) }
  })
})
