import { useEffect, useMemo, useState } from 'react'
import { Graph } from './Graph'
import { ClassIcon, CLS_NAME } from './ClassIcon'
import { pieceUrl } from './Board'
import { knightTour, bounce } from './knightTour'
import type { Review } from '../core/review'
import type { ParsedGame } from '../core/pgn'
const TIPS = [
  'Stockfish checks every position of your game, move by move.',
  'Everything runs on your device. Your game never leaves this browser.',
  'A Brilliant move is a sound sacrifice that keeps (or wins) the position.',
  'Book moves come from the Lichess opening database.',
  'Accuracy compares each move with the engine\'s best move.',
  'Great moves are the only good move, or the one that turns the game around.',
  'A Miss means you didn\'t punish your opponent\'s mistake.',
]
/** Full-screen "Evaluating the game" page: knight's tour, live evaluation graph, progress, last evaluated move, tips. */
export function Loading({ game, review, done, total, depthLabel, onCancel }: { game: ParsedGame; review: Review; done: number; total: number; depthLabel: string; onCancel: () => void }) {
  const tour = useMemo(knightTour, []), [t, setT] = useState(0), [tip, setTip] = useState(0)
  const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
  useEffect(() => { if (reduce) return; const a = setInterval(() => setT(x => x + 1), 420), b = setInterval(() => setTip(x => x + 1), 4200); return () => { clearInterval(a); clearInterval(b) } }, [reduce])
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0
  const [kx, ky] = tour[bounce(t)], trail = [1, 2, 3, 4].map(i => tour[bounce(Math.max(0, t - i))])
  const last = review.moves[review.moves.length - 1], starting = done === 0
  return <div className="loading" role="dialog" aria-modal="true" aria-label="Evaluating the game">
    <div className="lcard">
      <div className="lboard" aria-hidden="true">
        {Array.from({ length: 64 }, (_, i) => { const x = i % 8, y = Math.floor(i / 8), ti = trail.findIndex(([a, b]) => a === x && b === 7 - y)
          return <i key={i} className={(x + y) % 2 ? 'd' : 'l'} style={ti >= 0 ? { boxShadow: `inset 0 0 0 40px rgba(245,246,130,${0.55 - ti * 0.12})` } : undefined} /> })}
        <img className="lknight" src={pieceUrl('w', 'n')} alt="" style={{ transform: `translate(${kx * 100}%, ${(7 - ky) * 100}%)` }} />
      </div>
      <h2>Evaluating the game<span className="ldots" /></h2>
      <p className="lplayers">{game.headers.White ?? 'White'} <em>vs</em> {game.headers.Black ?? 'Black'}{review.opening ? ` · ${review.opening.name}` : ''}</p>
      <div className="lbar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Evaluation progress"><i style={{ width: `${Math.max(pct, 3)}%` }} /></div>
      <p className="lstat"><b>{pct}%</b> · {starting ? 'starting the engine…' : `position ${done} of ${total}`} · {depthLabel}</p>
      <div className="lgraph" aria-hidden="true"><Graph review={review} game={game} ply={Math.max(0, done - 1)} onSelect={() => {}} /></div>
      <p className="llast" aria-live="polite">{last ? <><ClassIcon cls={last.cls} size={18} /> {Math.ceil(last.ply / 2)}{last.color === 'w' ? '.' : '...'} {last.san} <span>{CLS_NAME[last.cls]}</span></> : ' '}</p>
      <p className="ltip">{TIPS[tip % TIPS.length]}</p>
      <button onClick={onCancel}>Cancel</button>
    </div></div>
}
