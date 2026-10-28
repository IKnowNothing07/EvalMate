import { Chess } from 'chess.js'
import { PROVENANCE, CLASSES, type GameSource, type LabelRecord, type Aggregate, type StoredAnalysis } from './types'
import { parsePgn } from '../core/pgn'
/** Dependency-free structural validation. Returns a list of problems (empty = valid). */
export function validateAll(games: GameSource[], labels: LabelRecord[], aggregates: Aggregate[], analysis?: StoredAnalysis): string[] {
  const errs: string[] = [], gameIds = new Set<string>(), parsed = new Map<string, ReturnType<typeof parsePgn>>()
  for (const g of games) {
    if (gameIds.has(g.id)) errs.push(`duplicate game id ${g.id}`); gameIds.add(g.id)
    for (const k of ['title', 'pgn', 'license', 'origin'] as const) if (!g[k]) errs.push(`game ${g.id}: missing ${k}`)
    try { parsed.set(g.id, parsePgn(g.pgn)) } catch (e) { errs.push(`game ${g.id}: bad PGN (${(e as Error).message})`) }
  }
  const ids = new Set<string>()
  for (const l of labels) {
    if (ids.has(l.id)) errs.push(`duplicate label id ${l.id}`); ids.add(l.id)
    if (!PROVENANCE.includes(l.provenance)) errs.push(`label ${l.id}: bad provenance ${l.provenance}`)
    if (!CLASSES.includes(l.label)) errs.push(`label ${l.id}: bad class ${l.label}`)
    if (!l.source) errs.push(`label ${l.id}: missing source`)
    if (!l.testable) { if (!l.missing) errs.push(`label ${l.id}: untestable label needs a "missing" explanation`); continue }
    const pg = l.gameId ? parsed.get(l.gameId) : undefined
    if (!pg) { errs.push(`label ${l.id}: unknown game ${l.gameId}`); continue }
    const m = l.ply ? pg.moves[l.ply - 1] : undefined
    if (!m) errs.push(`label ${l.id}: ply ${l.ply} out of range`)
    else if (l.san && m.san !== l.san) errs.push(`label ${l.id}: SAN mismatch (label ${l.san} vs game ${m.san})`)
  }
  for (const a of aggregates) { if (a.provenance !== 'chesscom-verified') errs.push(`aggregate ${a.id}: must be chesscom-verified`); if (a.testable && !(a.gameId && gameIds.has(a.gameId))) errs.push(`aggregate ${a.id}: testable but game missing`) }
  if (analysis) for (const g of games) { const a = analysis.games[g.id], p = parsed.get(g.id); if (!a || !p) { errs.push(`analysis missing for ${g.id}`); continue }
    for (const k of ['testEvals', 'refEvals'] as const) { if (a[k].length !== p.fens.length) errs.push(`analysis ${g.id}.${k}: ${a[k].length} evals for ${p.fens.length} positions`)
      a[k].forEach((e, i) => { if (e.fen !== p.fens[i]) errs.push(`analysis ${g.id}.${k}[${i}]: FEN mismatch (stale analysis? re-run dataset:build)`) }) } }
  void Chess; return errs
}
