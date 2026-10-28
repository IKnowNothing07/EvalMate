import { useState } from 'react'
import { Chess, type Square } from 'chess.js'
import { winPct, formatScore } from '../core/eval'
import { ClassIcon } from './ClassIcon'
import type { Classification } from '../core/types'
import type { Score } from '../core/types'
// Pieces: Colin M.L. Burnett "cburnett" set via Lichess (GPLv2+). See README.
const URLS = import.meta.glob('../assets/pieces/*.svg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
const piece = (color: string, type: string) => URLS[`../assets/pieces/${color}${type.toUpperCase()}.svg`]
export interface Props { fen: string; flipped: boolean; last?: [string, string] | null; arrow?: [string, string] | null; badge?: { sq: string; cls: Classification } | null; onMove: (from: string, to: string, promotion?: string) => void }

export function EvalBar({ score, flipped }: { score?: Score; flipped: boolean }) {
  const w = score ? winPct(score.cp) : 50, whiteAhead = w >= 50
  return <div className={`evalbar ${flipped ? 'flip' : ''}`} role="img" aria-label={score ? `Evaluation ${formatScore(score)}` : 'No evaluation yet'}>
    <div className="ebw" style={{ height: `${w}%` }} />
    <span className={`ebl ${whiteAhead ? 'wa' : 'ba'}`}>{score ? formatScore(score).replace('+', '') : ''}</span></div>
}

export function Board({ fen, flipped, last, arrow, badge, onMove }: Props) {
  const [sel, setSel] = useState<Square | null>(null); const [promo, setPromo] = useState<[string, string] | null>(null)
  const c = new Chess(fen); const files = 'abcdefgh'
  const legal = sel ? c.moves({ square: sel, verbose: true }).map(m => m.to) : []
  const inCheck = c.inCheck() ? c.board().flat().find(p => p && p.type === 'k' && p.color === c.turn())?.square : null
  const tryMove = (from: string, to: string) => {
    const mv = c.moves({ square: from as Square, verbose: true }).find(m => m.to === to); if (!mv) return false
    if (mv.promotion) setPromo([from, to]); else onMove(from, to); setSel(null); return true
  }
  const click = (sq: Square) => { if (sel && tryMove(sel, sq)) return; const p = c.get(sq); setSel(p && p.color === c.turn() ? sq : null) }
  const idx = (n: number) => (flipped ? 7 - n : n)
  const xy = (sq: string): [number, number] => [(idx(files.indexOf(sq[0])) + .5) * 12.5, (idx(8 - +sq[1]) + .5) * 12.5]
  // Arrow path: straight, or L-shaped for knight moves (like Chess.com). Tip is pulled back so the head ends near the square centre.
  const arrowPath = () => {
    if (!arrow) return null
    const [a, b] = [xy(arrow[0]), xy(arrow[1])], dx = b[0] - a[0], dy = b[1] - a[1]
    const knight = (Math.abs(dx) === 25 && Math.abs(dy) === 12.5) || (Math.abs(dx) === 12.5 && Math.abs(dy) === 25)
    const pts: [number, number][] = knight ? [a, Math.abs(dx) > Math.abs(dy) ? [b[0], a[1]] : [a[0], b[1]], b] : [a, b]
    const [p, q] = [pts[pts.length - 2], pts[pts.length - 1]], len = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1
    pts[pts.length - 1] = [q[0] - ((q[0] - p[0]) / len) * 3.2, q[1] - ((q[1] - p[1]) / len) * 3.2]
    return pts.map((t, i) => `${i ? 'L' : 'M'}${t[0]},${t[1]}`).join(' ')
  }
  const cells = []
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    const file = files[idx(f)], rank = 8 - idx(r), sq = (file + rank) as Square, p = c.get(sq), dark = (idx(f) + idx(r)) % 2 === 1
    const isLast = !!last && (last[0] === sq || last[1] === sq)
    cells.push(<div key={sq} role="button" aria-label={`${sq}${p ? ' ' + p.color + p.type : ''}`} onClick={() => click(sq)}
      onDragOver={e => e.preventDefault()} onDrop={e => { const from = e.dataTransfer.getData('text'); if (from) tryMove(from, sq) }}
      className={`sq ${dark ? 'dark' : 'light'} ${sel === sq ? 'sel' : ''} ${isLast ? 'last' : ''} ${inCheck === sq ? 'check' : ''}`}>
      {f === 0 && <i className="rk">{rank}</i>}{r === 7 && <i className="fl">{file}</i>}
      {legal.includes(sq) && <b className={p ? 'ring' : 'dot'} />}
      {p && <img className="pc" src={piece(p.color, p.type)} alt="" draggable onDragStart={e => { e.dataTransfer.setData('text', sq); setSel(sq) }} />}
      {badge && badge.sq === sq && <span className="sqbadge"><ClassIcon cls={badge.cls} size="100%" /></span>}
    </div>)
  }
  const d = arrowPath()
  return <div className="board-wrap"><div className="board">{cells}
    {d && <svg viewBox="0 0 100 100" className="arrow"><defs><marker id="ah" markerUnits="userSpaceOnUse" markerWidth="6" markerHeight="6" refX="0" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6Z" fill="#9bc53d" /></marker></defs>
      <path d={d} fill="none" stroke="#9bc53d" strokeWidth="2.4" opacity=".85" markerEnd="url(#ah)" /></svg>}
    {promo && <div className="promo">{['q', 'r', 'b', 'n'].map(p => <button key={p} onClick={() => { onMove(promo[0], promo[1], p); setPromo(null) }}><img src={piece(c.turn(), p)} alt={p} /></button>)}</div>}
    {c.isCheckmate() && <div className="badge">Checkmate</div>}{c.isStalemate() && <div className="badge">Stalemate</div>}</div></div>
}
