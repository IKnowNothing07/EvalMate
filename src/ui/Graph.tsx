import { useState } from 'react'
import { CLS_COLOR, CLS_NAME } from './ClassIcon'
const NOTABLE = ['brilliant', 'great', 'inaccuracy', 'mistake', 'miss', 'blunder']
import type { Review } from '../core/review'
import { formatScore, winPct } from '../core/eval'
import type { ParsedGame } from '../core/pgn'
export function Graph({ review, game, ply, onSelect }: { review: Review; game: ParsedGame; ply: number; onSelect: (p: number) => void }) {
  const [hover, setHover] = useState<number | null>(null); const n = game.fens.length, W = 400, H = 110
  const pts = review.evals.map((e, i) => e ? { i, cp: e.lines[0].score.cp, s: e.lines[0].score } : null)
  const x = (i: number) => (n > 1 ? (i / (n - 1)) * W : 0), y = (cp: number) => H - (winPct(cp) / 100) * H
  const done = pts.filter(Boolean) as NonNullable<typeof pts[number]>[]
  const area = done.length ? `M${x(0)},${H} ` + done.map(p => `L${x(p.i)},${y(p.cp)}`).join(' ') + ` L${x(done[done.length - 1].i)},${H}Z` : ''
  const at = (e: React.MouseEvent<SVGSVGElement>) => { const r = e.currentTarget.getBoundingClientRect(); return Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) / r.width) * (n - 1)))) }
  const hp = hover !== null ? pts[hover] : null
  return <div className="graph"><svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" onClick={e => onSelect(at(e))} onMouseMove={e => setHover(at(e))} onMouseLeave={() => setHover(null)}
    role="img" aria-label="Evaluation graph. Click to jump to a position.">
    <rect width={W} height={H} fill="#3a3733" /><path d={area} fill="#f2f2f2" /><line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="#888" strokeWidth=".6" />
    {review.moves.filter(m => NOTABLE.includes(m.cls)).map(m => <circle key={m.ply} cx={x(m.ply)} cy={y(m.evalAfter.cp)} r={m.ply === ply ? 4 : 2.8} fill={CLS_COLOR[m.cls]} stroke={m.ply === ply ? '#fff' : '#262421'} strokeWidth="0.8" />)}
    <line x1={x(ply)} x2={x(ply)} y1="0" y2={H} stroke="#7fb36b" strokeWidth="1" />
  </svg>{hp && <div className="tip">Move {hover}: {formatScore(hp.s)}{hover! > 0 && review.moves.find(m => m.ply === hover) ? ` · ${Math.ceil(hover! / 2)}${hover! % 2 ? '.' : '...'} ${game.moves[hover! - 1].san} (${CLS_NAME[review.moves.find(m => m.ply === hover)!.cls]})` : ''}</div>}</div>
}
