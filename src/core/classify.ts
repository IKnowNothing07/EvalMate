import { winPctFor } from './eval'
import type { Classification, PositionEval, Score } from './types'
/**
 * Classification (all numbers are win-% points = "expected points x 100" lost by the MOVER; every threshold is configurable).
 * Loss bands follow Chess.com's published expected-points table: Best 0.00 | Excellent <=0.02 | Good <=0.05 | Inaccuracy <=0.10 |
 * Mistake <=0.20 | Blunder >0.20. Chess.com's expected-points curve depends on the player's rating; ours is a fixed curve (see eval.ts).
 * Priority, first match wins:  Book > Brilliant > Great > Best > Excellent > Good > Miss > Inaccuracy > Mistake > Blunder.
 *  - loss = winBefore(best line) - win(played move). The played move's own MultiPV line is used when listed (same search).
 *  - Best:      the engine's top move, or a listed MultiPV alternative within `best` of it.
 *  - Brilliant (Chess.com: "always the best or nearly best move ... a good piece sacrifice"; "not in a bad position after";
 *               "not completely winning even if you hadn't found the move"): loss <= `excellent` AND a sacrifice AND not a recapture
 *               AND still >= brilliantMinAfter AND the BEST ALTERNATIVE move is not itself completely winning (< brilliantMaxAlt),
 *               unless the played move is the only forced mate.
 *  - Great (Chess.com: "critical to the outcome ... losing->equal, equal->winning, or the only good move"): engine's top move, not a
 *               recapture, not a single legal move, and either the second-best line is >= greatGap worse, or the best line is in a better
 *               outcome state (losing/equal/winning) than the second-best by >= greatStateGap.
 *  - Mate-allowed floor: Excellent/Good/Inaccuracy become Mistake if the move allows a forced mate that was not already there.
 *  - Miss (Chess.com: "fail to capitalize on your opponent's mistake ... opportunity to gain a winning position"): the opponent's last
 *               move lost >= missPrev, the best move would be winning (>= winAbove) or a forced mate, and this move gave up >= missLoss
 *               without collapsing (>= missAfterMin; a collapse is a Blunder).
 * Outcome states: losing < loseBelow, winning > winAbove, otherwise equal. NOT implemented: Chess.com's rating-dependent generosity.
 */
export interface Thresholds { best: number; excellent: number; good: number; inaccuracy: number; mistake: number
  greatGap: number; greatStateGap: number; loseBelow: number; winAbove: number
  missPrev: number; missLoss: number; missAfterMin: number
  brilliantMinAfter: number; brilliantMinDeficit: number; brilliantMaxAlt: number }
export const DEFAULT_THRESHOLDS: Thresholds = { best: 0.5, excellent: 2, good: 5, inaccuracy: 10, mistake: 20,
  greatGap: 15, greatStateGap: 8, loseBelow: 35, winAbove: 65, missPrev: 10, missLoss: 8, missAfterMin: 35,
  brilliantMinAfter: 40, brilliantMinDeficit: 2, brilliantMaxAlt: 95 } // 95% win ~ +8 pawns or any forced mate; the verified reference alternative (+5.7, ~89%) is still allowed
export interface MoveFacts { side: 'w'|'b'; playedUci: string; isBook: boolean; isSacrifice?: boolean; materialDeficit?: number | null
  isRecapture?: boolean; onlyLegal?: boolean; prevLoss?: number; materialBefore?: number }
export interface MoveResult { cls: Classification; winLoss: number; winBefore: number; winAfter: number; bestUci?: string; sacrifice: boolean; prevLoss: number }
const mateAgainst = (s: Score, side: 'w'|'b') => s.mate !== undefined && s.mate !== 0 && (s.mate > 0) !== (side === 'w')
const mateFor = (s: Score, side: 'w'|'b') => s.mate !== undefined && s.mate !== 0 && (s.mate > 0) === (side === 'w')
export const outcomeState = (win: number, t = DEFAULT_THRESHOLDS) => (win < t.loseBelow ? 0 : win > t.winAbove ? 2 : 1) // 0 losing, 1 equal, 2 winning
export function classifyMove(before: PositionEval, after: PositionEval, f: MoveFacts, t = DEFAULT_THRESHOLDS): MoveResult {
  const b = before.lines[0], a = after.lines[0], side = f.side, prevLoss = f.prevLoss ?? 0
  const winBefore = winPctFor(b.score, side), winAfter = winPctFor(a.score, side)
  const bestUci = b.pv[0], playedBest = bestUci === f.playedUci
  const listed = before.lines.find(l => l.pv[0] === f.playedUci)
  const winPlayed = listed ? winPctFor(listed.score, side) : winAfter
  const winLoss = playedBest ? 0 : Math.max(0, winBefore - winPlayed)
  const sacrifice = !f.isBook && (f.isSacrifice ?? (f.materialDeficit ?? 0) >= t.brilliantMinDeficit)
  const r = (cls: Classification): MoveResult => ({ cls, winLoss, winBefore, winAfter, bestUci, sacrifice, prevLoss })
  if (f.isBook) return r('book')
  const allowsMate = mateAgainst(a.score, side) && !mateAgainst(b.score, side)
  const second = before.lines[1], gap = second ? winBefore - winPctFor(second.score, side) : 0
  const alt = before.lines.find(l => l.pv[0] !== f.playedUci), altWin = alt ? winPctFor(alt.score, side) : null
  const forcedMate = mateFor(b.score, side) && !(alt && mateFor(alt.score, side))
  const bestTier = playedBest || (!!listed && winLoss <= t.best)
  if (winLoss <= t.excellent && sacrifice && !f.isRecapture && winPlayed >= t.brilliantMinAfter && (altWin === null || altWin < t.brilliantMaxAlt || forcedMate)) return r('brilliant')
  if (bestTier) {
    const crosses = !!second && outcomeState(winBefore, t) > outcomeState(winPctFor(second.score, side), t) && gap >= t.greatStateGap
    if (playedBest && !f.onlyLegal && !f.isRecapture && second && winBefore < 97 && (gap >= t.greatGap || crosses)) return r('great')
    return r('best')
  }
  const floored = (c: Classification) => (allowsMate && (c === 'excellent' || c === 'good' || c === 'inaccuracy') ? r('mistake') : r(c))
  if (winLoss <= t.excellent) return floored('excellent')
  if (winLoss <= t.good) return floored('good')
  const missedMate = mateFor(b.score, side) && !mateFor(a.score, side)
  if (winLoss >= t.missLoss && winAfter >= t.missAfterMin && ((prevLoss >= t.missPrev && winBefore >= t.winAbove) || missedMate)) return r('miss')
  if (winLoss <= t.inaccuracy) return floored('inaccuracy')
  if (winLoss <= t.mistake) return r('mistake')
  return r('blunder')
}
