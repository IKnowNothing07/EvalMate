import { winPctFor } from './eval'
import type { Classification, PositionEval, Score } from './types'
/**
 * Classification algorithm (all numbers are win-% points from the MOVER's perspective; every threshold is configurable).
 * Priority, first match wins:  Book > Brilliant > Great > Best > Excellent > Good > Miss > Inaccuracy > Mistake > Blunder.
 *  - loss = winBefore(best line) - win(played move). The played move's own MultiPV line is used when the engine listed it
 *    (same search, no depth noise); otherwise the evaluation of the resulting position is used.
 *  - Best:      the engine's top move, or a listed alternative within `best` of it.
 *  - Brilliant: Best-tier move that is a sound sacrifice (material deficit >= 2 along the engine line), not a recapture,
 *               not made when already far ahead (win% > brilliantMaxBefore AND up >= brilliantMaxLead points of material), unless it keeps a forced mate, still >= brilliantMinAfter.
 *  - Great:     the engine's only good move (second-best line >= greatGap worse), not a recapture, not a forced single legal move.
 *  - Mate-allowed floor: Excellent/Good/Inaccuracy become Mistake if the move allows a forced mate that was not already there.
 *  - Miss:      the opponent's last move lost >= missPrev, the mover had a real edge (>= missBefore) or a forced mate,
 *               and the move gave up >= missLoss without collapsing the position (>= missAfterMin).
 */
export interface Thresholds { best: number; excellent: number; good: number; inaccuracy: number; mistake: number; greatGap: number
  missPrev: number; missBefore: number; missLoss: number; missAfterMin: number; brilliantMaxBefore: number; brilliantMinAfter: number; brilliantMinDeficit: number; brilliantMaxLead: number }
export const DEFAULT_THRESHOLDS: Thresholds = { best: 0.5, excellent: 2, good: 5, inaccuracy: 10, mistake: 20, greatGap: 15,
  missPrev: 8, missBefore: 60, missLoss: 8, missAfterMin: 35, brilliantMaxBefore: 90, brilliantMinAfter: 40, brilliantMinDeficit: 2, brilliantMaxLead: 4 }
export interface MoveFacts { side: 'w'|'b'; playedUci: string; isBook: boolean; isSacrifice?: boolean; materialDeficit?: number | null
  isRecapture?: boolean; onlyLegal?: boolean; prevLoss?: number; materialBefore?: number }
export interface MoveResult { cls: Classification; winLoss: number; winBefore: number; winAfter: number; bestUci?: string; sacrifice: boolean; prevLoss: number }
const mateAgainst = (s: Score, side: 'w'|'b') => s.mate !== undefined && s.mate !== 0 && (s.mate > 0) !== (side === 'w')
const mateFor = (s: Score, side: 'w'|'b') => s.mate !== undefined && s.mate !== 0 && (s.mate > 0) === (side === 'w')
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
  // Mate-allowed floor: walking into a forced mate that was not already on the board is at least a Mistake, even when the
  // win-% drop is small because the position was already bad (win% saturates). Added after a Chess.com-verified case (17...bxa6).
  const allowsMate = mateAgainst(a.score, side) && !mateAgainst(b.score, side)
  const second = before.lines[1], gap = second ? winBefore - winPctFor(second.score, side) : 0
  if (playedBest || (listed && winLoss <= t.best)) {
    const forcedMate = mateFor(b.score, side) && !(second && mateFor(second.score, side))
    if (sacrifice && !f.isRecapture && winPlayed >= t.brilliantMinAfter && (winBefore <= t.brilliantMaxBefore || forcedMate || (f.materialBefore ?? 0) < t.brilliantMaxLead)) return r('brilliant')
    if (playedBest && !f.onlyLegal && !f.isRecapture && second && gap >= t.greatGap && winBefore < 97) return r('great')
    return r('best')
  }
  const floored = (c: Classification) => (allowsMate && (c === 'excellent' || c === 'good' || c === 'inaccuracy') ? r('mistake') : r(c))
  if (winLoss <= t.excellent) return floored('excellent')
  if (winLoss <= t.good) return floored('good')
  const missedMate = mateFor(b.score, side) && !mateFor(a.score, side)
  if (winLoss >= t.missLoss && winAfter >= t.missAfterMin && ((prevLoss >= t.missPrev && winBefore >= t.missBefore) || missedMate)) return r('miss')
  if (winLoss <= t.inaccuracy) return floored('inaccuracy')
  if (winLoss <= t.mistake) return r('mistake')
  return r('blunder')
}
