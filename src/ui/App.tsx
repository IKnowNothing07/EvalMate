import { useEffect, useMemo, useRef, useState } from 'react'
import { Chess } from 'chess.js'
import { Board, EvalBar } from './Board'
import { Graph } from './Graph'
import { ClassIcon, CLS_NAME } from './ClassIcon'
import { Summary } from './Summary'
import { Loading } from './Loading'
import { fetchRecentGames, RECENT_DAYS, EXAMPLE_USERNAME, type RecentGame } from '../chesscom'
import { AnalysisService } from '../core/analysis'
import { emptyVars, addMove, stepBack, stepForward, anchorOf, labelOf, removeSubtree, count as varCount, type VarState, type Loc } from '../core/variations'
import { lookupOpening } from '../core/openings'
import { winPctFor } from '../core/eval'
import type { Score, PositionEval } from '../core/types'
import { Engine, workerTransport, AnalysisCancelled } from '../core/engine'
import { parsePgn, PgnError, type ParsedGame } from '../core/pgn'
import { buildReview, runReview, terminalEval, DEPTHS, type Review, type ReviewedMove } from '../core/review'
import { explain, pvToSan, uciToSan, material } from '../core/explain'
import { formatScore } from '../core/eval'
import { annotatedPgn, reviewJson, reviewHtml, download } from '../export'
import { toDatasetRecord } from '../dataset/record'
import { loadAll, saveReview, deleteReview, clearAll, gameId, usedBytes, QUOTA_BYTES, loadUsername, saveUsername, forgetUsername, type SavedReview } from '../storage'

const BAD = ['inaccuracy', 'mistake', 'miss', 'blunder']
const engineUrl = () => (typeof chrome !== 'undefined' && chrome.runtime?.getURL ? chrome.runtime.getURL('engine/stockfish-19-lite-single.js') : './engine/stockfish-19-lite-single.js')
const fmt = (n: number | null) => (n === null ? '—' : n.toFixed(1))

export function App() {
  const [game, setGame] = useState<ParsedGame | null>(null); const [pgn, setPgn] = useState(''); const [review, setReview] = useState<Review | null>(null)
  const [err, setErr] = useState(''); const [prog, setProg] = useState<[number, number] | null>(null); const [saved, setSaved] = useState<SavedReview[]>([])
  const [ply, setPly] = useState(0); const [flip, setFlip] = useState(false); const [vars, setVars] = useState<VarState>(emptyVars()); const [varId, setVarId] = useState<string | null>(null); const [showBook, setShowBook] = useState(false)
  const [depthKey, setDepthKey] = useState<keyof typeof DEPTHS>('standard'); const [filter, setFilter] = useState<string>('all'); const [tab, setTab] = useState<'analysis' | 'report'>('analysis')
  const [playing, setPlaying] = useState(false); const abort = useRef<AbortController | null>(null); const engineRef = useRef<Engine | null>(null)
  const svcRef = useRef<AnalysisService | null>(null), navRef = useRef({ back: () => {}, fwd: () => {} }), lastBar = useRef<Score | undefined>(undefined)
  const [svcReady, setSvcReady] = useState(0), [, bump] = useState(0)
  const node = varId ? vars.nodes[varId] ?? null : null
  const refresh = () => loadAll().then(setSaved)
  useEffect(() => { refresh() }, [])
  // One lazily-started engine for exploring variations. Main-line evals are seeded into its cache (never recomputed, never modified).
  useEffect(() => {
    if (!game || !review || prog) return
    const svc = new AnalysisService(async () => { const e = new Engine(workerTransport(engineUrl())); await e.init(2); return e }, review.evals, Math.max(10, review.depth))
    svcRef.current = svc; setSvcReady(x => x + 1)
    return () => { svc.dispose(); if (svcRef.current === svc) svcRef.current = null }
  }, [game, review?.complete, prog === null])
  useEffect(() => {
    const svc = svcRef.current; if (!node || !svc || svc.get(node.fen)) return
    let alive = true; svc.request(node.fen).then(ev => { if (alive) bump(x => x + 1); void ev })
    return () => { alive = false }
  }, [node?.fen, svcReady])
  useEffect(() => { if (!playing || !game) return; const t = setInterval(() => setPly(p => { if (p >= game.fens.length - 1) { setPlaying(false); return p } return p + 1 }), 900); return () => clearInterval(t) }, [playing, game])
  useEffect(() => {
    if (!game) return
    const h = (e: KeyboardEvent) => { if ((e.target as HTMLElement).tagName === 'TEXTAREA' || (e.target as HTMLElement).tagName === 'INPUT') return
      if (e.key === 'ArrowLeft') navRef.current.back(); if (e.key === 'ArrowRight') navRef.current.fwd(); if (e.key === 'Home') go(0); if (e.key === 'End') go(game.fens.length - 1) }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  })
  const go = (p: number) => { if (!game) return; setVarId(null); setPly(Math.max(0, Math.min(game.fens.length - 1, p))) }

  async function start(text: string) {
    setErr('')
    let g: ParsedGame; try { g = parsePgn(text) } catch (e) { setErr(e instanceof PgnError ? e.message : 'Could not read PGN'); return }
    setGame(g); setPgn(text); setPly(0); setVars(emptyVars()); setVarId(null); setTab('analysis'); setReview(buildReview(g, g.fens.map(f => terminalEval(f)), 0))
    setProg([0, g.fens.length])
    const engine = new Engine(workerTransport(engineUrl())); engineRef.current = engine; abort.current = new AbortController()
    const depth = DEPTHS[depthKey]
    try {
      await engine.init()
      const r = await runReview(g, engine, depth, (d, t, partial) => { setProg([d, t]); setReview(partial) }, abort.current.signal)
      setReview(r)
      if (r.complete) { await saveReview({ id: gameId(text), savedAt: Date.now(), pgn: text, white: g.headers.White ?? '?', black: g.headers.Black ?? '?', result: g.result, review: r }); refresh() }
    } catch (e) { if (!(e instanceof AnalysisCancelled)) setErr('Engine error: ' + (e as Error).message + '. Check Troubleshooting in the README.') }
    finally { engine.destroy(); engineRef.current = null; setProg(null) }
  }
  const cancel = () => { abort.current?.abort(); engineRef.current?.stop() }

  if (!game || !review) return <Import {...{ err, setErr, start, saved, refresh, depthKey, setDepthKey, open: (s: SavedReview) => { const g = parsePgn(s.pgn); setGame(g); setPgn(s.pgn); setReview(buildReview(g, s.review.evals, s.review.depth)); setPly(0); setVars(emptyVars()); setVarId(null) } }} />

  const complete = review.complete, N = game.fens.length
  const curMove = ply > 0 ? review.moves.find(m => m.ply === ply) : undefined
  const svc = svcRef.current
  const fen = node ? node.fen : game.fens[ply]
  const posEval = node ? svc?.get(node.fen) : review.evals[ply] ?? undefined   // evaluation of the DISPLAYED position (game or variation)
  const prevEval = posEval?.lines[0]
  const last: [string, string] | null = node ? [node.uci.slice(0, 2), node.uci.slice(2, 4)] : ply > 0 ? [game.moves[ply - 1].uci.slice(0, 2), game.moves[ply - 1].uci.slice(2, 4)] : null
  const bestArrow = prevEval?.pv[0] ? ([prevEval.pv[0].slice(0, 2), prevEval.pv[0].slice(2, 4)] as [string, string]) : null
  if (posEval) lastBar.current = posEval.lines[0].score
  const barPending = !!node && !posEval
  let lastBook = 0; for (const m of review.moves) { if (m.cls === 'book' && m.ply === lastBook + 1) lastBook = m.ply; else break }
  const bad = review.moves.filter(m => BAD.includes(m.cls)).map(m => m.ply)
  const jump = (dir: 1 | -1) => { const t = dir === 1 ? bad.find(p => p > ply) : [...bad].reverse().find(p => p < ply); if (t) go(t) }
  const curLoc: Loc = node ? { kind: 'var', id: node.id } : { kind: 'main', ply }
  const applyLoc = (st: VarState, l: Loc) => { if (l.kind === 'main') { setVarId(null); setPly(l.ply) } else { setVarId(l.id); setPly(anchorOf(st, l)) } }
  navRef.current = { back: () => applyLoc(vars, stepBack(vars, curLoc)), fwd: () => applyLoc(vars, stepForward(vars, game, curLoc)) }
  // The original game is never modified: a move either follows the game, reuses a variation node, or creates a new node in `vars`.
  const onMove = (from: string, to: string, promotion?: string) => {
    const r = addMove(vars, game, curLoc, from, to, promotion); if (!r) return
    setVars(r.state); applyLoc(r.state, r.loc)
  }
  const playUci = (u: string) => onMove(u.slice(0, 2), u.slice(2, 4), u[4])
  const pathLabels = (() => { const out: string[] = []; let i = node?.id ?? null; while (i) { out.unshift(labelOf(vars, i)); i = vars.nodes[i].parent } return out })()
  const shown = review.moves.filter(m => filter === 'all' || (filter === 'bad' ? BAD.includes(m.cls) : m.cls === filter))
  const hdr = game.headers

  return <div className="app">
    <header><b className="logo">♞ EvalMate</b>
      <span className="players"><span className="chip w" />{hdr.White ?? '?'} {hdr.WhiteElo ? `(${hdr.WhiteElo})` : ''} <em>vs</em> <span className="chip b" />{hdr.Black ?? '?'} {hdr.BlackElo ? `(${hdr.BlackElo})` : ''}</span>
      <span className="meta">{game.result} · {hdr.TimeControl ?? '—'} · {review.opening ? `${review.opening.eco} ${review.opening.name}` : 'Opening not recognised'}</span>
      <span className={`status ${complete ? 'ok' : 'warn'}`}>{prog ? `Analysing ${prog[0]}/${prog[1]}` : complete ? `Complete · depth ${review.depth}` : 'INCOMPLETE — analysis was interrupted'}</span>
      {prog && <button onClick={cancel}>Cancel</button>}
      <button onClick={() => { cancel(); setGame(null); setReview(null); refresh() }}>Game list</button>
      <select aria-label="Export" value="" onChange={e => { const v = e.target.value
        if (v === 'pgn') download('game.pgn', pgn); if (v === 'apgn') download('game-analysed.pgn', annotatedPgn(game, review)); if (v === 'json') download('review.json', reviewJson(game, review), 'application/json'); if (v === 'html') download('review.html', reviewHtml(game, review), 'text/html'); if (v === 'dataset') download('evalmate-dataset-record.json', JSON.stringify(toDatasetRecord(game, pgn, review), null, 2), 'application/json') }}>
        <option value="">Export…</option><option value="pgn">Original PGN</option><option value="apgn" disabled={!review.moves.length}>Analysed PGN</option><option value="json">JSON report</option><option value="html">HTML report</option><option value="dataset">Dataset record (JSON)</option></select>
    </header>
    {err && <div className="err" role="alert">{err}</div>}
    {prog && <Loading game={game} review={review} done={prog[0]} total={prog[1]} depthLabel={`${depthKey} review · depth ${DEPTHS[depthKey]}`} onCancel={cancel} />}
    <nav className="tabs"><button className={tab === 'analysis' ? 'on' : ''} onClick={() => setTab('analysis')}>Analysis</button><button className={tab === 'report' ? 'on' : ''} onClick={() => setTab('report')}>Report</button></nav>
    {tab === 'report' ? <Report {...{ game, review }} /> : <main>
      <section className="col-board">
        <div className="board-row"><EvalBar score={posEval?.lines[0].score ?? (node ? lastBar.current : undefined)} flipped={flip} pending={barPending} />
          <div className="bcol"><PlayerBar hdr={hdr} color={flip ? 'w' : 'b'} />
            <Board fen={fen} flipped={flip} last={last} arrow={bestArrow} badge={curMove && !node ? { sq: game.moves[ply - 1].uci.slice(2, 4), cls: curMove.cls } : null} onMove={onMove} />
            <PlayerBar hdr={hdr} color={flip ? 'b' : 'w'} /></div></div>
        <div className="ctl"><button onClick={() => go(0)} aria-label="First">⏮</button><button onClick={() => navRef.current.back()} aria-label="Previous">◀</button>
          <button onClick={() => { setVarId(null); setPlaying(!playing) }} aria-label="Play/pause">{playing ? '⏸' : '▶'}</button><button onClick={() => navRef.current.fwd()} aria-label="Next">▶▶</button>
          <button onClick={() => go(N - 1)} aria-label="Last">⏭</button><button onClick={() => setFlip(!flip)}>Flip</button></div>
        {node && <div className="var">Exploring a variation. The game and its graph are unchanged. <b>{pathLabels.join(' ')}</b> <button onClick={() => { setVarId(null) }}>Back to game</button></div>}
        <div className="cur">{node ? `Variation from move ${anchorOf(vars, curLoc)}` : ply === 0 ? 'Start position' : `Move ${Math.ceil(ply / 2)}${game.moves[ply - 1].color === 'w' ? '.' : '...'} ${game.moves[ply - 1].san}`}</div>
      </section>
      <section className="col-moves">
        <Graph {...{ review, game, ply, onSelect: go }} />
        <div className="filters">{[['all', 'All'], ['bad', 'Errors'], ['blunder', 'Blunders'], ['mistake', 'Mistakes'], ['inaccuracy', 'Inaccuracies'], ['miss', 'Misses']].map(([k, l]) => <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l}</button>)}</div>
        <ol className="moves">{shown.map(m => <li key={m.ply}><button className={`mv ${m.cls} ${m.ply === ply && !node ? 'cur' : ''}`} onClick={() => go(m.ply)}>
          <span className="n">{Math.ceil(m.ply / 2)}{m.color === 'w' ? '.' : '…'}</span> {m.san} <ClassIcon cls={m.cls} /> <small>{formatScore(m.evalAfter)}</small></button></li>)}
          {!shown.length && <li className="empty">{review.moves.length ? 'No moves match this filter.' : 'Waiting for analysis…'}</li>}</ol>
        {varCount(vars) > 0 && <VariationPanel s={vars} cur={varId} onJump={id => applyLoc(vars, { kind: 'var', id })} onRemove={id => { const r = removeSubtree(vars, id); const inside = (() => { let i = varId; while (i) { if (i === id) return true; i = vars.nodes[i].parent } return false })(); setVars(r.state); if (inside) applyLoc(r.state, r.loc) }} onClear={() => { setVars(emptyVars()); setVarId(null) }} />}
      </section>
      <section className="col-info">
        <Info part="top" {...{ fen, review, ply, curMove, node, posEval, svcError: svc?.error ?? null, lastBook, showBook, setShowBook, onPlay: playUci, vars, svc, game }} />
        <Summary review={review} hdr={hdr} />
        <Info part="rest" {...{ fen, review, ply, curMove, node, posEval, svcError: svc?.error ?? null, lastBook, showBook, setShowBook, onPlay: playUci, vars, svc, game }} />
        <div className="ctl"><button onClick={() => jump(-1)} disabled={!bad.some(p => p < ply)}>◀ Prev error</button><button onClick={() => jump(1)} disabled={!bad.some(p => p > ply)}>Next error ▶</button></div>
      </section>
    </main>}
  </div>
}

function Info({ part, fen, review, ply, curMove, node, posEval, svcError, lastBook, showBook, setShowBook, onPlay, vars, svc, game }: { part: 'top' | 'rest'; fen: string; review: Review; ply: number; curMove?: ReviewedMove; node: VarState['nodes'][string] | null; posEval?: PositionEval; svcError: string | null
  lastBook: number; showBook: boolean; setShowBook: (b: boolean) => void; onPlay: (uci: string) => void; vars: VarState; svc: AnalysisService | null; game: ParsedGame }) {
  const line = posEval?.lines[0], mat = material(fen), inBook = !node && ply < lastBook && !showBook
  const side = fen.split(' ')[1] === 'w' ? 'White' : 'Black'
  // Evaluation change caused by the variation move (parent position vs this one), from the mover's point of view.
  const parentFen = node ? (node.parent ? vars.nodes[node.parent].fen : game.fens[node.anchor]) : null
  const parentEval = node && parentFen ? (node.parent ? svc?.get(parentFen) : review.evals[node.anchor] ?? undefined) : undefined
  const mover = parentFen ? (parentFen.split(' ')[1] as 'w' | 'b') : 'w'
  const delta = parentEval && line ? winPctFor(parentEval.lines[0].score, mover) - winPctFor(line.score, mover) : null
  const bestSan = line?.pv[0] ? uciToSan(fen, line.pv[0]) : null
  if (part === 'rest') return <div className="info">
    {!node && curMove && <div className="why"><h4>What was played: {curMove.san} <ClassIcon cls={curMove.cls} /> {CLS_NAME[curMove.cls]}</h4>
      <p>Eval before {formatScore(review.evals[ply - 1]!.lines[0].score)} → after {formatScore(curMove.evalAfter)} ({curMove.winLoss.toFixed(1)} win-% lost by {curMove.color === 'w' ? 'White' : 'Black'}).</p>
      {explain(game, review, curMove).map((t, i) => <p key={i}>{t}</p>)}
      {BAD.includes(curMove.cls) && <p>Best line: <span className="pv">{pvToSan(game.fens[ply - 1], review.evals[ply - 1]!.lines[0].pv, 6).join(' ')}</span></p>}</div>}
    <p className="mat">Material: {mat === 0 ? 'equal' : mat > 0 ? `White +${mat}` : `Black +${-mat}`}</p>
  </div>
  return <div className="info">
    <div className={`evalbox ${node && !posEval ? 'pending' : ''}`}><b>{line ? formatScore(line.score) : node ? 'Analysing…' : '…'}</b><small>{line ? `depth ${line.depth}${line.nps ? ` · ${Math.round(line.nps / 1000)}k nps` : ''}${line.nodes ? ` · ${line.nodes.toLocaleString()} nodes` : ''}` : node ? (svcError ? 'engine error' : 'engine is thinking') : 'not analysed yet'}</small></div>
    {svcError && <p className="note warn">Engine error: {svcError}. Move to another position to retry.</p>}
    {node && parentEval && line && <p className="note">This move: eval {formatScore(parentEval.lines[0].score)} → {formatScore(line.score)}{delta !== null && delta > 0.5 ? ` (${delta.toFixed(1)} win-% lost by ${mover === 'w' ? 'White' : 'Black'})` : ''}.</p>}
    {inBook ? <div className="bestbox"><h4>Opening theory</h4><p>{lookupOpening(game.fens[ply])?.name ?? review.opening?.name ?? 'Book move'}. Engine suggestions start after the book line ends (move {Math.ceil((lastBook + 1) / 2)}).</p><button onClick={() => setShowBook(true)}>Show suggestion anyway</button></div>
      : line && line.pv.length > 0 ? <div className="bestbox"><h4>Best continuation for {side}</h4><p className="pv">{pvToSan(fen, line.pv, 8).join(' ')}</p>
        <p>Best move: <b>{bestSan ?? '—'}</b> ({formatScore(line.score)})</p>{bestSan && <button className="primary" onClick={() => onPlay(line.pv[0])}>Play {bestSan}</button>}</div>
      : line ? <p className="note">Game over in this position.</p> : null}
  </div>
}

function VarLine({ s, id, cur, onJump }: { s: VarState; id: string; cur: string | null; onJump: (id: string) => void }) {
  const chain: string[] = []; for (let i: string | undefined = id; i; i = s.nodes[i].children[0]) chain.push(i)
  return <span className="vline">{chain.map((k, j) => <span key={k}><button className={`vm ${k === cur ? 'cur' : ''}`} onClick={() => onJump(k)}>{labelOf(s, k)}</button>
    {j > 0 && s.nodes[chain[j - 1]].children.slice(1).map(c => <span key={c} className="vsub">(<VarLine s={s} id={c} cur={cur} onJump={onJump} />)</span>)} </span>)}</span>
}
function VariationPanel({ s, cur, onJump, onRemove, onClear }: { s: VarState; cur: string | null; onJump: (id: string) => void; onRemove: (id: string) => void; onClear: () => void }) {
  const anchors = Object.keys(s.roots).map(Number).sort((a, b) => a - b)
  return <div className="vpanel"><h4>Variations <button className="vx" onClick={onClear}>Clear all</button></h4>
    {anchors.map(a => <div key={a}><small className="note">From move {a === 0 ? 'start' : `${Math.ceil(a / 2)}${a % 2 ? '' : '...'}`}</small>
      {s.roots[a].map(r => <div className="vrow" key={r}><VarLine s={s} id={r} cur={cur} onJump={onJump} /><button className="vx" aria-label="Delete variation" onClick={() => onRemove(r)}>×</button></div>)}</div>)}</div>
}

function Report({ game, review }: { game: ParsedGame; review: Review }) {
  const f = review.complete
  if (!review.moves.length) return <div className="report"><p>No analysed moves yet.</p></div>
  const sides = ['w', 'b'] as const
  const phase = (ply: number) => (ply <= 20 ? 'Opening' : ply <= 60 ? 'Middlegame' : 'Endgame')
  const errs = review.moves.filter(m => ['mistake', 'blunder', 'miss'].includes(m.cls))
  const byPhase: Record<string, number> = {}; errs.forEach(m => (byPhase[phase(m.ply)] = (byPhase[phase(m.ply)] ?? 0) + 1))
  const swings = [...review.moves].sort((a, b) => b.winLoss - a.winLoss).filter(m => m.winLoss >= 10).slice(0, 5)
  const bestMove = review.moves.find(m => m.cls === 'brilliant') ?? review.moves.find(m => m.cls === 'great')
  const miss = review.moves.filter(m => m.cls === 'miss').sort((a, b) => b.winLoss - a.winLoss)[0]
  const hung = errs.filter(m => explain(game, review, m).some(t => t.startsWith('It allows the opponent to win'))).length
  const missedCap = errs.filter(m => explain(game, review, m).some(t => t.includes('best move captured'))).length
  const recs: string[] = []
  if (hung >= 1) recs.push(`Check what your move leaves undefended before playing it — ${hung} error(s) here allowed a piece to be won.`)
  if (missedCap >= 1) recs.push(`Look for captures and checks first — ${missedCap} error(s) missed a capture the engine preferred.`)
  if (byPhase.Opening >= 1) recs.push('Review your opening: errors appeared in the first 10 moves.')
  if (miss) recs.push('Practise converting winning positions: the review found a missed win.')
  if (byPhase.Endgame >= 1) recs.push('Practise endgames: errors appeared late in the game.')
  return <div className="report">
    {!f && <p className="warn">Analysis is incomplete, so this report covers only analysed moves.</p>}
    <h3>Result: {game.result} · {review.opening ? `${review.opening.eco} ${review.opening.name}` : 'Opening not recognised'}</h3>
    <p className="note">Accuracy is EvalMate's own estimate and will differ from Chess.com's.</p>
    <Summary review={review} hdr={game.headers} />
    <h4>Turning points</h4>{swings.length ? <ul>{swings.map(m => <li key={m.ply}>Move {Math.ceil(m.ply / 2)} {m.san} ({m.cls}, {m.winLoss.toFixed(0)} win-% lost)</li>)}</ul> : <p>No large swings found.</p>}
    <h4>Highlights</h4><p>Best decision: {bestMove ? `${bestMove.san} (${bestMove.cls})` : 'no brilliant/great move detected'}. Biggest missed win: {miss ? `${miss.san} at move ${Math.ceil(miss.ply / 2)}` : 'none detected'}.</p>
    <h4>Errors by phase (mistakes, blunders, misses)</h4><p>{['Opening', 'Middlegame', 'Endgame'].map(p => `${p}: ${byPhase[p] ?? 0}`).join(' · ')} <small>(phase = by move number, a rough guide)</small></p>
    <h4>Training suggestions</h4>{recs.length ? <ul>{recs.slice(0, 3).map((r, i) => <li key={i}>{r}</li>)}</ul> : <p>Not enough errors in this game to draw training conclusions.</p>}
  </div>
}

function Import({ err, setErr, start, saved, refresh, depthKey, setDepthKey, open }: { err: string; setErr: (s: string) => void; start: (t: string) => void; saved: SavedReview[]; refresh: () => void; depthKey: string; setDepthKey: (k: any) => void; open: (s: SavedReview) => void }) {
  const [text, setText] = useState(''); const [user, setUser] = useState(''); const [games, setGames] = useState<RecentGame[] | null>(null); const [skipped, setSkipped] = useState(0)
  const [busy, setBusy] = useState(false); const [bytes, setBytes] = useState(0); const [remembered, setRemembered] = useState(false); const [example, setExample] = useState(false)
  useEffect(() => { usedBytes().then(setBytes) }, [saved])
  async function fetchGames(name?: string, remember = true) {
    setErr(''); setBusy(true); setGames(null); setExample(!remember)
    try {
      const r = await fetchRecentGames(name ?? user); const u = (name ?? user).trim().toLowerCase()
      setGames(r.games); setSkipped(r.skipped); setUser(u)
      if (remember) { await saveUsername(u); setRemembered(true) }   // remember only the user's own usernames that worked (never the example)
    } catch (e) { setErr((e as Error).message + '. You can paste a PGN instead.') } finally { setBusy(false) }
  }
  // Remembered username: pre-fill and load the last 30 days straight away.
  useEffect(() => { loadUsername().then(u => { if (u) { setUser(u); setRemembered(true); fetchGames(u) } }) }, [])
  const n = saved.length, wdl = { w: 0, d: 0, l: 0 }
  saved.forEach(s => { if (s.result === '1/2-1/2') wdl.d++; else if (s.result === '1-0') wdl.w++; else if (s.result === '0-1') wdl.l++ })
  const accs = saved.map(s => s.review.accuracy.w).filter((x): x is number => x !== null)
  const tally = games ? { Win: games.filter(g => g.result === 'Win').length, Loss: games.filter(g => g.result === 'Loss').length, Draw: games.filter(g => g.result === 'Draw').length } : null
  return <div className="app import"><header><b className="logo">♞ EvalMate</b><span className="meta">Local Stockfish game review — nothing is uploaded.</span></header>
    {err && <div className="err" role="alert">{err}</div>}
    <div className="grid">
      <section><h3>Import from Chess.com</h3><p className="note">Loads every standard game from the last {RECENT_DAYS} days (across months). Your username is remembered on this device.</p>
        <div className="row"><input placeholder={`Chess.com username, e.g. ${EXAMPLE_USERNAME}`} aria-label="Chess.com username" value={user} onChange={e => { setUser(e.target.value); setExample(false) }} onKeyDown={e => e.key === 'Enter' && fetchGames()} />
          <button onClick={() => fetchGames()} disabled={busy}>{busy ? 'Loading…' : games ? 'Refresh' : 'Find games'}</button>
          {remembered && <button aria-label="Forget username" title="Forget this username" onClick={async () => { await forgetUsername(); setRemembered(false); setUser(''); setGames(null) }}>Forget</button>}</div>
        {!remembered && !games && !busy && !user && <p className="note">New here? <button className="linkbtn" onClick={() => { setUser(EXAMPLE_USERNAME); fetchGames(EXAMPLE_USERNAME, false) }}>Try an example: {EXAMPLE_USERNAME}</button></p>}
        {example && games && !busy && <p className="note">Showing the example account <b>{EXAMPLE_USERNAME}</b>. Enter your own username above to review your games.</p>}
        {busy && <p className="note">Fetching games from Chess.com…</p>}
        {games && tally && <p className="note" role="status">{games.length} game{games.length === 1 ? '' : 's'} in the last {RECENT_DAYS} days{games.length ? ` · ${tally.Win}W ${tally.Loss}L ${tally.Draw}D` : ''}{skipped ? ` · ${skipped} variant game${skipped === 1 ? '' : 's'} skipped` : ''}</p>}
        <ul className="list glist">{(games ?? []).map((g, i) => <li key={g.url ?? i}><button className="gbtn" onClick={() => start(g.pgn)}>
          <span className="gdate">{g.date}</span><span className={`gres ${g.result}`}>{g.result}</span><span className="gopp"><i className={`chip ${g.color}`} />vs {g.opponent}{g.oppRating ? ` (${g.oppRating})` : ''}</span><small>{g.timeClass}{g.reason ? ` · ${g.reason}` : ''}</small></button></li>)}</ul>
        {games && !games.length && <p className="note">No standard-chess games in the last {RECENT_DAYS} days. You can paste a PGN below.</p>}
        <h3>Or paste / upload a PGN</h3><textarea rows={8} placeholder="Paste PGN here" value={text} onChange={e => setText(e.target.value)} />
        <div className="row"><input type="file" accept=".pgn,text/plain" aria-label="Upload PGN" onChange={async e => { const f = e.target.files?.[0]; if (f) setText(await f.text()) }} />
          <select value={depthKey} onChange={e => setDepthKey(e.target.value)} aria-label="Strength"><option value="quick">Quick (depth {DEPTHS.quick})</option><option value="standard">Standard (depth {DEPTHS.standard})</option><option value="deep">Deep (depth {DEPTHS.deep})</option></select>
          <button className="primary" onClick={() => start(text)}>Review Game</button></div></section>
      <section><h3>Saved reviews ({n})</h3><p className="note">Stored locally: {(bytes / 1024).toFixed(0)} KB of ~{QUOTA_BYTES / 1024 / 1024} MB.</p>
        {n >= 5 ? <p className="note">Results {wdl.w}W / {wdl.d}D / {wdl.l}L (White's side of each game) · avg White accuracy {fmt(accs.reduce((a, b) => a + b, 0) / (accs.length || 1))}</p> : <p className="note">Trends appear after 5 reviewed games.</p>}
        <ul className="list">{saved.map(s => <li key={s.id}><button onClick={() => open(s)}>{s.white} vs {s.black} · {s.result} · {fmt(s.review.accuracy.w)}/{fmt(s.review.accuracy.b)}</button>
          <button aria-label="Delete" onClick={async () => { await deleteReview(s.id); refresh() }}>🗑</button></li>)}</ul>
        {n > 0 && <button onClick={async () => { if (confirm('Delete all saved reviews?')) { await clearAll(); refresh() } }}>Delete all</button>}</section>
    </div></div>
}

function PlayerBar({ hdr, color }: { hdr: Record<string, string>; color: 'w' | 'b' }) {
  const name = color === 'w' ? hdr.White : hdr.Black, elo = color === 'w' ? hdr.WhiteElo : hdr.BlackElo
  return <div className="pbar"><span className={`chip ${color}`} /><b>{name ?? '?'}</b>{elo && <span className="elo">({elo})</span>}</div>
}
