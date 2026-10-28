import type { Score, EngineLine } from './types'
export const MATE_CP = 10000
/** UCI scores are from the side-to-move's view. Convert to White's view. */
export function parseInfo(line: string, turn: 'w'|'b'): EngineLine | null {
  if (!line.startsWith('info') || !line.includes(' pv ') || !line.includes(' score ')) return null
  if (line.includes('lowerbound') || line.includes('upperbound')) return null
  const g = (k: string) => { const m = line.match(new RegExp(`\\b${k} (-?\\d+)`)); return m ? +m[1] : undefined }
  const sm = line.match(/score (cp|mate) (-?\d+)/); if (!sm) return null
  const sign = turn === 'w' ? 1 : -1, v = +sm[2] * sign
  const score: Score = sm[1] === 'cp' ? { cp: v } : { cp: Math.sign(v || 1) * (MATE_CP - Math.min(Math.abs(v), 999)), mate: v }
  return { multipv: g('multipv') ?? 1, score, depth: g('depth') ?? 0, nodes: g('nodes'), nps: g('nps'),
    pv: line.split(' pv ')[1].trim().split(/\s+/) }
}
/** Win probability (0-100) for White from centipawns (Lichess logistic fit). */
export function winPct(cp: number) { return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * Math.max(-MATE_CP, Math.min(MATE_CP, cp)))) - 1) }
/** Win% for the given side. */
export function winPctFor(score: Score, side: 'w'|'b') { const w = winPct(score.cp); return side === 'w' ? w : 100 - w }
export function formatScore(s: Score) {
  if (s.mate !== undefined) return s.mate === 0 ? '#' : `${s.mate > 0 ? '+' : '-'}M${Math.abs(s.mate)}`
  const v = (s.cp / 100).toFixed(2); return s.cp > 0 ? `+${v}` : v
}
