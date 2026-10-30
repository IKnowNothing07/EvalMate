import { Chess } from 'chess.js'
import type { ParsedGame } from './pgn'
import type { Review, ReviewedMove } from './review'
import { formatScore } from './eval'
const V: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }
const NAME: Record<string, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }
export function uciToSan(fen: string, uci?: string) {
  if (!uci) return null
  try { return new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san } catch { return null }
}
export function pvToSan(fen: string, pv: string[], max = 6) {
  const c = new Chess(fen), out: string[] = []
  for (const u of pv.slice(0, max)) { try { out.push(c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }).san) } catch { break } }
  return out
}
export function material(fen: string) {
  let w = 0, b = 0; for (const row of new Chess(fen).board()) for (const p of row) if (p) (p.color === 'w' ? (w += V[p.type]) : (b += V[p.type])); return w - b
}
/** Deterministic, evidence-based sentences. Only states what can be verified from the engine line and the position. */
export function explain(game: ParsedGame, review: Review, m: ReviewedMove): string[] {
  const i = m.ply - 1, before = game.fens[i], after = game.fens[i + 1], out: string[] = []
  const best = uciToSan(before, m.bestUci)
  const lossTxt = `${m.winLoss.toFixed(1)} win-% lost`
  if (m.cls === 'book') { out.push(`Known opening move${m.opening ? ` (${m.opening.eco} ${m.opening.name})` : ''}.`); return out }
  if (m.cls === 'brilliant') { out.push(`A sound sacrifice: it gives up material along the engine's main line yet the position stays good for you (${m.winAfter.toFixed(0)}% win chance).`); return out }
  if (m.cls === 'great') { out.push('The engine\'s only good move here: the next-best alternative is clearly worse.'); return out }
  if (m.cls === 'miss') { out.push(`The opponent's previous move gave you a real chance (they lost ${m.prevLoss.toFixed(0)} win-%); this move did not take it. Engine preferred ${best ?? 'another move'}.`); return out }
  if (['best', 'excellent', 'good'].includes(m.cls)) {
    out.push(m.cls === 'best' ? 'This matches the engine\'s top choice.' : `Close to the engine's choice (${lossTxt}).`)
    if (best && m.cls !== 'best') out.push(`Engine preferred ${best}.`)
    return out
  }
  out.push(`The engine rates this ${m.cls} (${lossTxt}); it preferred ${best ?? 'another move'}.`)
  const ev = review.evals[i + 1]?.lines[0]
  if (ev?.score.mate !== undefined && ev.score.mate !== 0 && (ev.score.mate > 0) !== (m.color === 'w')) out.push(`It allows a forced mate (${formatScore(ev.score)}).`)
  else if (m.winBefore >= 85 && m.winAfter < 60) out.push('You had a winning position and this gave much of it away.')
  // Missed capture
  const c = new Chess(before); const bm = m.bestUci ? (() => { try { return c.move({ from: m.bestUci!.slice(0, 2), to: m.bestUci!.slice(2, 4), promotion: m.bestUci![4] }) } catch { return null } })() : null
  if (bm?.captured && !game.moves[i].san.includes('x')) out.push(`The best move captured a ${NAME[bm.captured]}; the move played did not capture.`)
  if (bm && /[+#]/.test(bm.san) && !/[+#]/.test(game.moves[i].san)) out.push(`The best move (${bm.san}) gave check${bm.san.includes('#') ? 'mate' : ''}.`)
  // Opponent's best reply captures something
  const reply = review.evals[i + 1]?.lines[0]?.pv[0]
  if (reply) { try { const d = new Chess(after), r = d.move({ from: reply.slice(0, 2), to: reply.slice(2, 4), promotion: reply[4] })
    if (r.captured && V[r.captured] >= 3) out.push(`It allows the opponent to win a ${NAME[r.captured]} with ${r.san}.`) } catch { /* ignore */ } }
  const dm = material(after) - material(before); const mine = m.color === 'w' ? dm : -dm
  if (mine <= -2) out.push(`Material immediately drops by ${-mine} points for you.`)
  if (out.length === 1) out.push('The exact tactical reason is not one EvalMate can verify automatically; compare the engine line on the right.')
  return out
}
