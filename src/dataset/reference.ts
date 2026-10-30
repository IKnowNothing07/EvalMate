import { winPctFor } from '../core/eval'
import type { Classification, PositionEval } from '../core/types'
/**
 * Engine-derived REFERENCE labels from a deeper search. Deliberately simple (no sacrifice/miss/book logic), loss-based only:
 * expected-points loss = win% lost by the mover. Bands (0.02 / 0.05 / 0.10 / 0.20) match Chess.com's published expected-points table
 * (checked against a screenshot of their support page supplied by the user). Their curve is rating-dependent; ours is fixed.
 * Only the six loss classes can be derived from an engine alone; Brilliant/Great/Miss/Book cannot.
 */
export const REF_BANDS = { excellent: 2, good: 5, inaccuracy: 10, mistake: 20 }
export function referenceLabel(before: PositionEval, after: PositionEval, playedUci: string, side: 'w' | 'b'): Classification {
  const b = before.lines[0], listed = before.lines.find(l => l.pv[0] === playedUci), wb = winPctFor(b.score, side)
  const wp = b.pv[0] === playedUci ? wb : listed ? winPctFor(listed.score, side) : winPctFor(after.lines[0].score, side)
  const loss = Math.max(0, wb - wp)
  if (b.pv[0] === playedUci || loss <= 0.5 && listed) return 'best'
  return loss <= REF_BANDS.excellent ? 'excellent' : loss <= REF_BANDS.good ? 'good' : loss <= REF_BANDS.inaccuracy ? 'inaccuracy' : loss <= REF_BANDS.mistake ? 'mistake' : 'blunder'
}
/** Collapse special classes to the loss class they sit on, so they can be compared with loss-only reference labels. Book is not comparable. */
export function lossFamily(cls: Classification, winLoss: number): Classification | null {
  if (cls === 'book') return null
  if (cls === 'brilliant' || cls === 'great') return 'best'
  if (cls === 'miss') return winLoss <= REF_BANDS.inaccuracy ? 'inaccuracy' : winLoss <= REF_BANDS.mistake ? 'mistake' : 'blunder'
  return cls
}
