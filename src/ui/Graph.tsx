import { useLayoutEffect, useRef, useState } from 'react'
import { CLS_COLOR, CLS_NAME } from './ClassIcon'
import type { Review } from '../core/review'
import { formatScore, graphLevel } from '../core/eval'
import type { ParsedGame } from '../core/pgn'
import { curveCommands } from './curve'
const NOTABLE = ['brilliant', 'great', 'inaccuracy', 'mistake', 'miss', 'blunder']
const H = 112, PAD = 6
/** Evaluation graph. Draws EXACT engine values (position i = after i plies) as a smooth non-overshooting curve at pixel size. */
export function Graph({ review, game, ply, onSelect }: { review: Review; game: ParsedGame; ply: number; onSelect: (p: number) => void }) {
  const box = useRef<HTMLDivElement>(null), down = useRef(false)
  const [w, setW] = useState(400), [hover, setHover] = useState<number | null>(null)
  useLayoutEffect(() => { const el = box.current; if (!el) return; const set = () => setW(Math.max(120, Math.round(el.clientWidth))); set()
    const ro = new ResizeObserver(set); ro.observe(el); return () => ro.disconnect() }, [])
  const n = game.fens.length, span = Math.max(1, n - 1)
  const x = (i: number) => PAD + (i / span) * (w - 2 * PAD), y = (cp: number) => H - (graphLevel(cp) / 100) * H
  const pts = review.evals.flatMap((e, i) => (e ? [{ i, x: x(i), y: y(e.lines[0].score.cp) }] : []))
  const first = pts[0], last = pts[pts.length - 1]
  const area = first ? `M0,${H} L0,${first.y} L${first.x},${first.y} ${curveCommands(pts)} L${last.i === n - 1 ? w : last.x},${last.y} L${last.i === n - 1 ? w : last.x},${H}Z` : ''
  const at = (e: React.PointerEvent<SVGSVGElement>) => { const r = e.currentTarget.getBoundingClientRect(); return Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left - PAD) / (r.width - 2 * PAD)) * span))) }
  const evalAt = (i: number) => review.evals[i]?.lines[0].score, mvAt = (i: number) => review.moves.find(m => m.ply === i)
  const dot = (i: number) => { const s = evalAt(i); return s ? { cx: x(i), cy: y(s.cp) } : null }
  const hs = hover !== null ? evalAt(hover) : null, hm = hover !== null && hover > 0 ? mvAt(hover) : undefined, cur = dot(ply)
  return <div className="graph" ref={box}>
    <svg width={w} height={H} viewBox={`0 0 ${w} ${H}`} role="img" aria-label="Evaluation graph. Click or drag to jump to a position."
      onPointerDown={e => { down.current = true; e.currentTarget.setPointerCapture(e.pointerId); onSelect(at(e)) }}
      onPointerMove={e => { const i = at(e); setHover(i); if (down.current) onSelect(i) }}
      onPointerUp={() => { down.current = false }} onPointerCancel={() => { down.current = false }} onPointerLeave={() => setHover(null)}>
      <defs><clipPath id="gclip"><rect width={w} height={H} rx="4" /></clipPath></defs>
      <g clipPath="url(#gclip)">
        <rect width={w} height={H} fill="#403d39" />
        <path d={area} fill="#f4f4f4" />
        <line x1="0" x2={w} y1={H / 2 + 0.5} y2={H / 2 + 0.5} stroke="#8d8982" strokeWidth="1" />
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1="0" y2={H} stroke="#fff" strokeOpacity=".25" />}
        <line x1={x(ply)} x2={x(ply)} y1="0" y2={H} stroke="#7fb36b" strokeWidth="1.5" />
        {review.moves.filter(m => NOTABLE.includes(m.cls) && m.ply !== ply).map(m => { const d = dot(m.ply); return d && <circle key={m.ply} cx={d.cx} cy={d.cy} r="3.6" fill={CLS_COLOR[m.cls]} stroke="rgba(0,0,0,.3)" strokeWidth="1" /> })}
        {cur && <circle cx={cur.cx} cy={cur.cy} r="4.6" fill={mvAt(ply) && NOTABLE.includes(mvAt(ply)!.cls) ? CLS_COLOR[mvAt(ply)!.cls] : '#7fb36b'} stroke="#fff" strokeWidth="1.6" />}
      </g>
    </svg>
    {hs && <div className="tip" style={{ left: Math.min(Math.max(x(hover!), 90), w - 90), right: 'auto', transform: 'translateX(-50%)' }}>
      {hover === 0 ? 'Start' : `${Math.ceil(hover! / 2)}${hover! % 2 ? '.' : '...'} ${game.moves[hover! - 1].san}${hm ? ` · ${CLS_NAME[hm.cls]}` : ''}`} · {formatScore(hs)}</div>}
  </div>
}
