import { Chess } from 'chess.js'
import type { PuzzleRecord } from './types'
/** Parse the Lichess puzzle CSV (database.lichess.org/#puzzles, CC0): PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags.
 *  FEN is BEFORE the opponent's move; Moves[0] is that opponent move, Moves[1..] the solution. Invalid rows are skipped, not guessed. */
export function parsePuzzleCsv(csv: string, limit = Infinity): { puzzles: PuzzleRecord[]; skipped: number } {
  const out: PuzzleRecord[] = []; let skipped = 0
  for (const line of csv.split(/\r?\n/)) {
    if (!line.trim() || line.startsWith('PuzzleId')) continue
    const c = line.split(','); if (c.length < 8) { skipped++; continue }
    const [id, fen, moves, rating, , , , themes] = c, mv = moves.trim().split(/\s+/)
    try { const g = new Chess(fen); for (const u of mv) g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }) } catch { skipped++; continue }
    if (mv.length < 2) { skipped++; continue }
    out.push({ id, provenance: 'puzzle-theme-derived', source: 'Lichess puzzle database (CC0)', license: 'CC0', fenBeforeOpponentMove: fen, moves: mv, themes: themes.trim().split(/\s+/), rating: +rating || undefined })
    if (out.length >= limit) break
  }
  return { puzzles: out, skipped }
}
/** The position the solver faces, and the solution move: puzzle tests expect the solution NOT to be classified Inaccuracy/Mistake/Blunder. */
export function puzzleTestCase(p: PuzzleRecord) {
  const g = new Chess(p.fenBeforeOpponentMove), o = p.moves[0]; g.move({ from: o.slice(0, 2), to: o.slice(2, 4), promotion: o[4] })
  return { fen: g.fen(), solutionUci: p.moves[1], themes: p.themes }
}
