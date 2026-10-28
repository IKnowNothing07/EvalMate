/**
 * Estimated game (performance) rating. NOT an official rating and NOT Chess.com's formula (which is not public).
 * Method: Regan & Haworth, "Intrinsic Performance Ratings" (AAAI 2011): scaled error per move
 *   e = | s(v_best) - s(v_played) |,  s(v) = sign(v) * ln(1 + |v|)  (v in pawns, mover's view),
 * restricted to positions within +-3 pawns and excluding book moves; then  IPR ~= 3571 - 15413 * mean(e).
 * Their constants were fitted to Rybka 3 at depth 13 on long human games; ChessIQ runs Stockfish (lite) at lower depth,
 * and we have NOT calibrated against Chess.com reviews, so treat results as rough (+-300 or worse), esp. for short games.
 */
export interface RatingEstimate { rating: number | null; ae: number | null; moves: number; reason?: string }
export const MIN_MOVES = 8, POS_LIMIT_CP = 300, RELIABLE_MIN = 400, RELIABLE_MAX = 3000
const s = (v: number) => Math.sign(v) * Math.log1p(Math.abs(v))
const clampP = (v: number) => Math.max(-10, Math.min(10, v))
/** cp values from the MOVER's perspective. Returns null when the position is outside the +-3 pawn window. */
export function scaledError(bestCp: number, playedCp: number): number | null {
  if (!Number.isFinite(bestCp) || !Number.isFinite(playedCp) || Math.abs(bestCp) > POS_LIMIT_CP) return null
  return Math.abs(s(clampP(bestCp / 100)) - s(clampP(Math.min(playedCp, bestCp) / 100)))
}
export function estimateRating(errors: number[]): RatingEstimate {
  if (errors.length < MIN_MOVES) return { rating: null, ae: null, moves: errors.length, reason: `Needs at least ${MIN_MOVES} analysed, non-book moves in balanced positions` }
  const ae = errors.reduce((a, b) => a + b, 0) / errors.length
  const raw = 3571 - 15413 * ae
  // Outside this window the linear fit is extrapolating (it was fitted on ~1000-2900 players): refuse instead of showing a clamped number.
  if (raw < RELIABLE_MIN || raw > RELIABLE_MAX) return { rating: null, ae, moves: errors.length, reason: `Estimate (${Math.round(raw)}) is outside the model's reliable range ${RELIABLE_MIN}-${RELIABLE_MAX}` }
  return { rating: Math.round(raw / 50) * 50, ae, moves: errors.length }
}
