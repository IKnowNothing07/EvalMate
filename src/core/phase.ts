import { Chess } from 'chess.js'
export type Phase = 'opening' | 'middlegame' | 'endgame'
export const PHASES: Phase[] = ['opening', 'middlegame', 'endgame']
/**
 * Phase rules (position-based, modelled on the Lichess "Divider"; thresholds are ChessIQ's):
 *  - Endgame:    <= 6 minor/major pieces left (both sides combined).
 *  - Middlegame: <= 10 minor/major pieces, OR either side has fewer than 4 pieces left on its back rank (development done).
 *  - Opening:    otherwise.
 * Phases only move forward (opening -> middlegame -> endgame), so each move belongs to exactly one phase.
 * Each move is assigned the phase of the position BEFORE it is played.
 */
export function rawPhase(fen: string): Phase {
  const b = new Chess(fen).board(); let pieces = 0, wBack = 0, bBack = 0
  b.forEach((row, r) => row.forEach(p => {
    if (!p || p.type === 'p') return
    if (p.type !== 'k') pieces++
    if (p.color === 'w' && r === 7) wBack++
    if (p.color === 'b' && r === 0) bBack++
  }))
  if (pieces <= 6) return 'endgame'
  if (pieces <= 10 || wBack < 4 || bBack < 4) return 'middlegame'
  return 'opening'
}
export function assignPhases(fensBeforeMoves: string[]): Phase[] {
  let cur = 0; return fensBeforeMoves.map(f => { cur = Math.max(cur, PHASES.indexOf(rawPhase(f))); return PHASES[cur] })
}
