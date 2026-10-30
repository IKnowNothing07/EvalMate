import { Chess } from 'chess.js'
import type { Engine } from './engine'
import { classifyMove, DEFAULT_THRESHOLDS, type MoveResult } from './classify'
import { moveAccuracy } from './accuracy'
import { lookupOpening } from './openings'
import { winPctFor } from './eval'
import { materialDeficit, seeSacrifice } from './sacrifice'
import { assignPhases, PHASES, type Phase } from './phase'
import { estimateRating, scaledError, type RatingEstimate } from './rating'
import type { ParsedGame } from './pgn'
import type { PositionEval, Score, Classification } from './types'
export const DEPTHS = { quick: 10, standard: 14, deep: 18 } as const
export const SCHEMA = 2 // bump when classification rules change; saved reviews are re-classified from stored evals
export interface ReviewedMove extends MoveResult { san: string; uci: string; color: 'w'|'b'; ply: number; evalBefore: Score; evalAfter: Score; phase: Phase; opening?: { eco: string; name: string } }
export interface PhaseStat { n: number; accuracy: number | null; avgLoss: number | null; indicator: Classification | null }
type Side = 'w'|'b'
export interface Review { schema: number; evals: (PositionEval | null)[]; moves: ReviewedMove[]; complete: boolean; depth: number;
  accuracy: Record<Side, number | null>; counts: Record<Side, Partial<Record<Classification, number>>>; opening: { eco: string; name: string } | null;
  phases: Record<Side, Record<Phase, PhaseStat>>; rating: Record<Side, RatingEstimate> }
export const MIN_PHASE_MOVES = 3
/** Display indicator for a phase, from the AVERAGE win-% lost per non-book move (documented in README). */
export function phaseIndicator(avgLoss: number): Classification {
  return avgLoss <= 1 ? 'best' : avgLoss <= 2 ? 'excellent' : avgLoss <= 4 ? 'good' : avgLoss <= 7 ? 'inaccuracy' : avgLoss <= 12 ? 'mistake' : 'blunder'
}
export function terminalEval(fen: string): PositionEval | null {
  const c = new Chess(fen)
  if (c.isCheckmate()) return { fen, depth: 0, lines: [{ multipv: 1, pv: [], depth: 0, score: { cp: c.turn() === 'w' ? -10000 : 10000, mate: 0 } }] }
  if (c.isDraw() || c.isStalemate()) return { fen, depth: 0, lines: [{ multipv: 1, pv: [], depth: 0, score: { cp: 0 } }] }
  return null
}
/** Build the review from (possibly partial) evals. A move is classified only when both neighbouring evals exist.
 *  This is the single source of truth: board badges, move list, graph, summary, phases and rating all read from it. */
export function buildReview(game: ParsedGame, evals: (PositionEval | null)[], depth: number): Review {
  const moves: ReviewedMove[] = []; const phases = assignPhases(game.fens.slice(0, game.moves.length))
  const counts: Review['counts'] = { w: {}, b: {} }; let last: { eco: string; name: string } | null = null
  const per: Record<Side, { loss: number; phase: Phase }[]> = { w: [], b: [] }; const errs: Record<Side, number[]> = { w: [], b: [] }
  let inBook = true
  game.moves.forEach((m, i) => {
    const op = lookupOpening(m.fen)
    // Book = position is in the opening DB AND we have not left theory (re-entry by transposition only in the first 12 plies).
    const book = !!op && !m.san.endsWith('#') && (inBook || i + 1 <= 12); inBook = book
    if (op) last = op
    const b = evals[i], a = evals[i + 1]; if (!b || !a) return
    const opp: Side = m.color === 'w' ? 'b' : 'w', prev = evals[i - 1]
    const prevLoss = prev ? Math.max(0, winPctFor(prev.lines[0].score, opp) - winPctFor(b.lines[0].score, opp)) : 0
    const pm = game.moves[i - 1]
    const isRecapture = !!pm && pm.san.includes('x') && m.san.includes('x') && pm.uci.slice(2, 4) === m.uci.slice(2, 4)
    const onlyLegal = new Chess(game.fens[i]).moves().length === 1
    const def = book ? null : materialDeficit(game.fens[i], m.uci, a.lines[0].pv)
    // Sacrifice = either the engine line gives material up, OR the moved piece is left en prise in a net-losing exchange (see seeSacrifice).
    const isSacrifice = !book && ((def ?? 0) >= DEFAULT_THRESHOLDS.brilliantMinDeficit || seeSacrifice(game.fens[i], m.uci).sacrifice)
    const res = classifyMove(b, a, { side: m.color, playedUci: m.uci, isBook: book, isSacrifice, isRecapture, onlyLegal, prevLoss }, DEFAULT_THRESHOLDS)
    moves.push({ ...res, san: m.san, uci: m.uci, color: m.color, ply: i + 1, phase: phases[i], evalBefore: b.lines[0].score, evalAfter: a.lines[0].score, opening: op ?? undefined })
    counts[m.color][res.cls] = (counts[m.color][res.cls] ?? 0) + 1
    if (res.cls !== 'book') {
      per[m.color].push({ loss: res.winLoss, phase: phases[i] })
      const sg = m.color === 'w' ? 1 : -1, played = before_played(b, m.uci, a, sg)
      const e = scaledError(b.lines[0].score.cp * sg, played); if (e !== null) errs[m.color].push(e)
    }
  })
  const mean = (x: number[]) => (x.length ? x.reduce((s, v) => s + v, 0) / x.length : null)
  const accuracy = {} as Review['accuracy'], ph = {} as Review['phases'], rating = {} as Review['rating']
  for (const s of ['w', 'b'] as const) {
    const all = per[s].map(x => moveAccuracy(x.loss)); accuracy[s] = mean(all); ph[s] = {} as Record<Phase, PhaseStat>
    for (const p of PHASES) {
      const xs = per[s].filter(x => x.phase === p), n = xs.length, avg = mean(xs.map(x => x.loss))
      ph[s][p] = { n, accuracy: n >= MIN_PHASE_MOVES ? mean(xs.map(x => moveAccuracy(x.loss))) : null, avgLoss: avg, indicator: n >= MIN_PHASE_MOVES && avg !== null ? phaseIndicator(avg) : null }
    }
    rating[s] = estimateRating(errs[s])
  }
  return { schema: SCHEMA, evals, moves, complete: evals.every(Boolean), depth, opening: last, counts, accuracy, phases: ph, rating }
}
/** Mover-perspective cp of the played move: its own MultiPV line if listed (same search), else the resulting position. */
function before_played(b: PositionEval, uci: string, a: PositionEval, sg: number) {
  const l = b.lines.find(x => x.pv[0] === uci); return (l ? l.score.cp : a.lines[0].score.cp) * sg
}
export async function runReview(game: ParsedGame, engine: Engine, depth: number,
  onProgress: (done: number, total: number, partial: Review) => void, signal?: AbortSignal): Promise<Review> {
  const evals: (PositionEval | null)[] = game.fens.map(() => null)
  for (let i = 0; i < game.fens.length; i++) {
    if (signal?.aborted) { engine.stop(); break }
    evals[i] = terminalEval(game.fens[i]) ?? await engine.analyze(game.fens[i], depth)
    onProgress(i + 1, game.fens.length, buildReview(game, evals, depth))
  }
  return buildReview(game, evals, depth)
}
