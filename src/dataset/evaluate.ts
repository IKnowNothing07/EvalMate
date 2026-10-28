import { parsePgn, type ParsedGame } from '../core/pgn'
import { buildReview, terminalEval, type Review } from '../core/review'
import type { PositionEval, Classification } from '../core/types'
import { CLASSES, LOSS_CLASSES, PROVENANCE, type GameSource, type LabelRecord, type Aggregate, type StoredAnalysis } from './types'
import { referenceLabel, lossFamily } from './reference'
import { perClass } from './metrics'
export interface Prediction { game: ParsedGame; review: Review }
/** Re-run OUR classifier offline from the stored evals (no engine needed => deterministic). */
export function predict(games: GameSource[], analysis: StoredAnalysis): Record<string, Prediction> {
  const out: Record<string, Prediction> = {}
  for (const g of games) { const game = parsePgn(g.pgn); out[g.id] = { game, review: buildReview(game, analysis.games[g.id].testEvals, analysis.testDepth) } }
  return out
}
export interface Row { id: string; truth: Classification; predicted: Classification | null; ok: boolean; san?: string; tags?: string[] }
const scoreLabels = (labels: LabelRecord[], pred: Record<string, Prediction>): { rows: Row[]; untestable: LabelRecord[] } => {
  const rows: Row[] = [], untestable: LabelRecord[] = []
  for (const l of labels) { if (!l.testable) { untestable.push(l); continue }
    const m = pred[l.gameId!]?.review.moves.find(x => x.ply === l.ply); const p = m?.cls ?? null
    rows.push({ id: l.id, truth: l.label, predicted: p, ok: p === l.label, san: l.san, tags: l.tags }) }
  return { rows, untestable }
}
export function evaluateDataset(games: GameSource[], verified: LabelRecord[], manual: LabelRecord[], aggregates: Aggregate[], analysis: StoredAnalysis) {
  const pred = predict(games, analysis)
  const v = scoreLabels(verified, pred), m = scoreLabels(manual, pred)
  // Engine-derived reference labels (deeper search) vs our classifier at test depth. Book moves are not comparable.
  const pairs: [string, string][] = [], detail: { game: string; ply: number; san: string; ref: string; ours: string; family: string }[] = []
  for (const g of games) { const { game, review } = pred[g.id], ref = analysis.games[g.id].refEvals
    for (const mv of review.moves) { const fam = lossFamily(mv.cls, mv.winLoss); if (!fam) continue
      const b = ref[mv.ply - 1] ?? terminalEval(game.fens[mv.ply - 1]), a = ref[mv.ply] ?? terminalEval(game.fens[mv.ply]); if (!b || !a) continue
      const truth = referenceLabel(b as PositionEval, a as PositionEval, mv.uci, mv.color); pairs.push([truth, fam]); detail.push({ game: g.id, ply: mv.ply, san: mv.san, ref: truth, ours: mv.cls, family: fam }) } }
  const engine = { ...perClass(pairs, LOSS_CLASSES), n: pairs.length, detail }
  // Coverage: how many labelled examples per class, per provenance (so gaps are visible).
  const coverage: Record<string, Record<string, number>> = {}; for (const c of CLASSES) coverage[c] = Object.fromEntries(PROVENANCE.map(p => [p, 0]))
  for (const l of [...verified, ...manual]) coverage[l.label][l.provenance]++
  for (const [t] of pairs) coverage[t]['engine-derived']++
  const unverifiedAggs = aggregates.map(a => ({ id: a.id, testable: a.testable, note: a.testable ? 'comparable' : 'PGN not available - not compared' }))
  return { pred, verified: { ...v, n: v.rows.length, correct: v.rows.filter(r => r.ok).length }, manual: { ...m, n: m.rows.length, correct: m.rows.filter(r => r.ok).length }, engine, coverage, aggregates: unverifiedAggs }
}
