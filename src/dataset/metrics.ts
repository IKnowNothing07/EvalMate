import { MIN_SUPPORT } from './types'
export interface ClassStat { label: string; support: number; predicted: number; tp: number; precision: number | null; recall: number | null; f1: number | null; status: 'reliable' | 'unreliable' | 'insufficient-evidence' }
export const RELIABLE_F1 = 0.8
/** pairs of [truth, predicted]. Precision/recall are null (never 0 or NaN) when undefined. */
export function perClass(pairs: [string, string][], classes: string[]): { stats: ClassStat[]; confusion: Record<string, Record<string, number>>; accuracy: number | null } {
  const confusion: Record<string, Record<string, number>> = {}; for (const c of classes) confusion[c] = Object.fromEntries(classes.map(k => [k, 0]))
  let ok = 0; for (const [t, p] of pairs) { if (confusion[t] && p in confusion[t]) confusion[t][p]++; if (t === p) ok++ }
  const stats = classes.map(c => { const support = pairs.filter(([t]) => t === c).length, predicted = pairs.filter(([, p]) => p === c).length, tp = confusion[c][c]
    const precision = predicted ? tp / predicted : null, recall = support ? tp / support : null, f1 = precision !== null && recall !== null && precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : precision !== null && recall !== null ? 0 : null
    const status: ClassStat['status'] = support < MIN_SUPPORT ? 'insufficient-evidence' : f1 !== null && f1 >= RELIABLE_F1 ? 'reliable' : 'unreliable'
    return { label: c, support, predicted, tp, precision, recall, f1, status } })
  return { stats, confusion, accuracy: pairs.length ? ok / pairs.length : null }
}
