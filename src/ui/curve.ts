/**
 * Monotone cubic Hermite interpolation (Fritsch-Carlson). The curve passes EXACTLY through every data point and never overshoots
 * the values of neighbouring points (no invented peaks/dips), and tangents are shared at each node (no corners).
 * Points must have strictly increasing x.
 */
export interface Pt { x: number; y: number }
export interface Seg { p0: Pt; c1: Pt; c2: Pt; p3: Pt }
export function monotoneSegments(pts: Pt[]): Seg[] {
  const n = pts.length; if (n < 2) return []
  const h: number[] = [], d: number[] = []
  for (let k = 0; k < n - 1; k++) { h.push(pts[k + 1].x - pts[k].x); d.push((pts[k + 1].y - pts[k].y) / h[k]) }
  const m: number[] = new Array(n).fill(0)
  m[0] = d[0]; m[n - 1] = d[n - 2]
  for (let k = 1; k < n - 1; k++) m[k] = d[k - 1] * d[k] <= 0 ? 0 : (d[k - 1] + d[k]) / 2 // local extremum or flat => horizontal tangent
  for (let k = 0; k < n - 1; k++) {
    if (d[k] === 0) { m[k] = 0; m[k + 1] = 0; continue }
    const a = m[k] / d[k], b = m[k + 1] / d[k], s = a * a + b * b
    if (s > 9) { const t = 3 / Math.sqrt(s); m[k] = t * a * d[k]; m[k + 1] = t * b * d[k] }
  }
  return pts.slice(0, -1).map((p, k) => ({ p0: p, p3: pts[k + 1],
    c1: { x: p.x + h[k] / 3, y: p.y + (m[k] * h[k]) / 3 }, c2: { x: pts[k + 1].x - h[k] / 3, y: pts[k + 1].y - (m[k + 1] * h[k]) / 3 } }))
}
const f = (v: number) => +v.toFixed(2)
/** SVG path "C" commands for the curve, starting from the first point (without the leading M). */
export function curveCommands(pts: Pt[]): string {
  return monotoneSegments(pts).map(s => `C${f(s.c1.x)},${f(s.c1.y)} ${f(s.c2.x)},${f(s.c2.y)} ${f(s.p3.x)},${f(s.p3.y)}`).join(' ')
}
