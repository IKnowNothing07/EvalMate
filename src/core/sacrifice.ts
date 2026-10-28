import { Chess, type Square } from 'chess.js'
const V: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }
function bal(c: Chess, side: 'w' | 'b') { let t = 0; for (const row of c.board()) for (const p of row) if (p) t += (p.color === side ? 1 : -1) * V[p.type]; return t }
/**
 * Material the mover gives up for the move, judged along the engine's own continuation (PV of the position AFTER the move).
 * Returns the smallest material deficit (points, from the mover's view) seen after 2, 4, 6... PV plies, so a temporary
 * exchange that is regained does not count. Returns null if the PV is too short to judge (needs >= 4 plies, or a mate ending).
 */
export function materialDeficit(beforeFen: string, uci: string, afterPv: string[]): number | null {
  const c = new Chess(beforeFen), side = c.turn(), m0 = bal(c, side)
  try { c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }) } catch { return null }
  let min = Infinity, n = 0
  for (const u of afterPv) {
    try { c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }) } catch { break }
    n++
    if (n % 2 === 0) { const mated = c.isCheckmate(); if (n >= 4 || mated) min = Math.min(min, m0 - bal(c, side)); if (mated) break }
  }
  return min === Infinity ? null : min
}

/** Material lead (points) of the side to move in `fen`. */
export function materialLead(fen: string): number { const c = new Chess(fen); return bal(c, c.turn()) }
/** Static exchange evaluation: what the side to move nets by capturing on `sq` (cheapest attacker first, may stop any time). */
function see(c: Chess, sq: Square, depth = 8): number {
  if (depth === 0) return 0
  const caps = c.moves({ verbose: true }).filter(m => m.to === sq && m.captured)
  if (!caps.length) return 0
  caps.sort((a, b) => (a.piece === 'k' ? 99 : V[a.piece]) - (b.piece === 'k' ? 99 : V[b.piece]))
  const m = caps[0], val = V[m.captured!]
  c.move(m); const g = val - see(c, sq, depth - 1); c.undo()
  return Math.max(0, g)
}
export interface SeeResult { risk: number; captured: number; oppGain: number; net: number; sacrifice: boolean }
/**
 * Static-exchange sacrifice test. After the move, the opponent may capture the MOVED piece; `oppGain` is what the full
 * exchange on that square nets them. With `captured` = value the move itself took:
 *   net = captured - oppGain (your material change if they take).
 * It is a sacrifice when the piece risked is a minor piece or more AND it exceeds what was captured by >= 2 AND the
 * opponent really wins material (oppGain >= 2) AND you end up >= 1 point down. Even trades (N takes N) never qualify.
 */
export function seeSacrifice(beforeFen: string, uci: string): SeeResult {
  const none = { risk: 0, captured: 0, oppGain: 0, net: 0, sacrifice: false }
  const c = new Chess(beforeFen)
  let mv; try { mv = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }) } catch { return none }
  const risk = V[mv.piece], captured = mv.captured ? V[mv.captured] : 0
  if (risk < 3 || mv.promotion) return none
  const oppGain = see(c, mv.to as Square), net = captured - oppGain
  return { risk, captured, oppGain, net, sacrifice: oppGain >= 2 && risk - captured >= 2 && net <= -1 }
}
