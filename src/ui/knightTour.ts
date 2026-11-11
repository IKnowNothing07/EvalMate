/** A full knight's tour of the board (every square once, each step a legal knight move), by Warnsdorff's rule. Deterministic. */
const MOVES = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]]
export function knightTour(): [number, number][] {
  for (let start = 0; start < 64; start++) {
    const seen = new Set<number>(), path: [number, number][] = []; let cur: [number, number] = [start % 8, Math.floor(start / 8)]
    const next = (p: [number, number]) => MOVES.map(([dx, dy]) => [p[0] + dx, p[1] + dy] as [number, number]).filter(([x, y]) => x >= 0 && x < 8 && y >= 0 && y < 8 && !seen.has(y * 8 + x))
    for (;;) { seen.add(cur[1] * 8 + cur[0]); path.push(cur); const n = next(cur); if (!n.length) break
      cur = n.map(q => [q, next(q).length] as const).sort((a, b) => a[1] - b[1])[0][0] }
    if (path.length === 64) return path
  }
  throw new Error('no knight tour found')
}
/** Index into the tour that walks forward then backward forever (every step stays a knight move). */
export const bounce = (t: number, len = 64) => { const p = t % (2 * (len - 1)); return p < len ? p : 2 * (len - 1) - p }
