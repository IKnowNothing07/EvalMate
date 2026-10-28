/** Per-move accuracy from win% lost (Lichess-style exponential fit). ChessIQ's own estimate; differs from Chess.com. */
export function moveAccuracy(winLoss: number) {
  if (!Number.isFinite(winLoss)) return 0
  return Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * Math.max(0, winLoss)) - 3.1669))
}
/** Mean of move accuracies; null if no analysed moves (never fabricate a score). */
export function sideAccuracy(losses: number[]) {
  if (!losses.length) return null
  return losses.reduce((s, l) => s + moveAccuracy(l), 0) / losses.length
}
