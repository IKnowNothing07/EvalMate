import { useState } from 'react'
import type { Review } from '../core/review'
import { PHASES } from '../core/phase'
import { ClassIcon, CLS_COLOR, CLS_NAME, SUMMARY_ORDER } from './ClassIcon'
const f1 = (n: number | null) => (n === null ? '—' : n.toFixed(1))
const PHASE_NAME = { opening: 'Opening', middlegame: 'Middlegame', endgame: 'Endgame' }
/** Chess.com-style summary. Every number is read from the Review object (no hardcoded values). */
export function Summary({ review, hdr }: { review: Review; hdr: Record<string, string> }) {
  const [info, setInfo] = useState(false)
  const analysed = review.moves.length > 0
  return <details open className="sum"><summary>Game review {review.complete ? '' : <em className="warn">(incomplete)</em>}</summary>
    <div className="sumrow names"><span /><b className="wcol">{hdr.White ?? 'White'}</b><span /><b className="bcol2">{hdr.Black ?? 'Black'}</b></div>
    <div className="sumrow"><span className="lbl">Accuracy</span><span className="box w">{f1(review.accuracy.w)}</span><span /><span className="box b">{f1(review.accuracy.b)}</span></div>
    <div className="sumrow"><span className="lbl">Game Rating <button className="inf" aria-label="What is game rating?" aria-expanded={info} onClick={() => setInfo(!info)}>ⓘ</button></span>
      {(['w', 'b'] as const).map((s, i) => <span key={s} className={`box ${s}`} style={{ gridColumn: i ? 4 : 2 }} title={review.rating[s].rating === null ? review.rating[s].reason : `~${review.rating[s].rating} (${review.rating[s].moves} moves used)`}>
        {review.rating[s].rating === null ? 'n/a' : `≈${review.rating[s].rating}`}</span>)}</div>
    {info && <p className="note infobox">Estimated performance rating for this one game (Regan &amp; Haworth intrinsic-rating model on Stockfish evaluations). It is not an official or account rating, is not Chess.com's formula, is uncalibrated against Chess.com, and is only shown when enough balanced-position moves exist. Treat it as rough.</p>}
    <hr />
    {SUMMARY_ORDER.map(k => <div className="sumrow" key={k}><span className="lbl">{CLS_NAME[k]}</span>
      <b style={{ color: CLS_COLOR[k] }} className="cnt">{analysed ? review.counts.w[k] ?? 0 : '—'}</b><ClassIcon cls={k} size={22} /><b style={{ color: CLS_COLOR[k] }} className="cnt">{analysed ? review.counts.b[k] ?? 0 : '—'}</b></div>)}
    <hr /><div className="sumrow names"><span className="lbl">Phases</span><span className="cnt2">accuracy</span><span /><span className="cnt2">accuracy</span></div>
    {PHASES.map(p => <div className="sumrow" key={p}><span className="lbl">{PHASE_NAME[p]}</span>
      {(['w', 'b'] as const).map((s, i) => { const st = review.phases[s][p]
        return <span key={s} className={`ph ${i ? 'r' : ''}`} style={{ gridColumn: i ? 4 : 2 }} title={st.n === 0 ? 'No moves in this phase' : st.accuracy === null ? `Only ${st.n} analysed move(s): too few for a score` : `${st.n} moves`}>
          {st.indicator ? <ClassIcon cls={st.indicator} size={18} title={`${PHASE_NAME[p]}: ${CLS_NAME[st.indicator]}`} /> : null}<b>{f1(st.accuracy)}</b></span> })}</div>)}
    <p className="note">Accuracy and ratings are ChessIQ estimates; they will differ from Chess.com's. Book moves are excluded.</p>
  </details>
}
