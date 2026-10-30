import { useEffect, useMemo, useRef, useState } from 'react'
import { Chess } from 'chess.js'
import { Board, EvalBar } from './Board'
import { Graph } from './Graph'
import { ClassIcon, CLS_NAME } from './ClassIcon'
import { Summary } from './Summary'
import { Engine, workerTransport, AnalysisCancelled } from '../core/engine'
import { parsePgn, PgnError, type ParsedGame } from '../core/pgn'
import { buildReview, runReview, terminalEval, DEPTHS, type Review, type ReviewedMove } from '../core/review'
import { explain, pvToSan, uciToSan, material } from '../core/explain'
import { formatScore } from '../core/eval'
import { annotatedPgn, reviewJson, reviewHtml, download } from '../export'
import { toDatasetRecord } from '../dataset/record'
import { loadAll, saveReview, deleteReview, clearAll, gameId, usedBytes, QUOTA_BYTES, type SavedReview } from '../storage'

const BAD = ['inaccuracy', 'mistake', 'miss', 'blunder']
const engineUrl = () => (typeof chrome !== 'undefined' && chrome.runtime?.getURL ? chrome.runtime.getURL('engine/stockfish-19-lite-single.js') : './engine/stockfish-19-lite-single.js')
const fmt = (n: number | null) => (n === null ? '—' : n.toFixed(1))

export function App() {
  const [game, setGame] = useState<ParsedGame | null>(null); const [pgn, setPgn] = useState(''); const [review, setReview] = useState<Review | null>(null)
  const [err, setErr] = useState(''); const [prog, setProg] = useState<[number, number] | null>(null); const [saved, setSaved] = useState<SavedReview[]>([])
  const [ply, setPly] = useState(0); const [flip, setFlip] = useState(false); const [sandbox, setSandbox] = useState<{ fen: string; sans: string[]; last: [string, string] } | null>(null)
  const [depthKey, setDepthKey] = useState<keyof typeof DEPTHS>('standard'); const [filter, setFilter] = useState<string>('all'); const [tab, setTab] = useState<'analysis' | 'report'>('analysis')
  const [playing, setPlaying] = useState(false); const abort = useRef<AbortController | null>(null); const engineRef = useRef<Engine | null>(null)
  const refresh = () => loadAll().then(setSaved)
  useEffect(() => { refresh() }, [])
  useEffect(() => { if (!playing || !game) return; const t = setInterval(() => setPly(p => { if (p >= game.fens.length - 1) { setPlaying(false); return p } return p + 1 }), 900); return () => clearInterval(t) }, [playing, game])
  useEffect(() => {
    if (!game) return
    const h = (e: KeyboardEvent) => { if ((e.target as HTMLElement).tagName === 'TEXTAREA' || (e.target as HTMLElement).tagName === 'INPUT') return
      if (e.key === 'ArrowLeft') go(ply - 1); if (e.key === 'ArrowRight') go(ply + 1); if (e.key === 'Home') go(0); if (e.key === 'End') go(game.fens.length - 1) }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  })
  const go = (p: number) => { if (!game) return; setSandbox(null); setPly(Math.max(0, Math.min(game.fens.length - 1, p))) }

  async function start(text: string) {
    setErr('')
    let g: ParsedGame; try { g = parsePgn(text) } catch (e) { setErr(e instanceof PgnError ? e.message : 'Could not read PGN'); return }
    setGame(g); setPgn(text); setPly(0); setSandbox(null); setTab('analysis'); setReview(buildReview(g, g.fens.map(f => terminalEval(f)), 0))
    const engine = new Engine(workerTransport(engineUrl())); engineRef.current = engine; abort.current = new AbortController()
    const depth = DEPTHS[depthKey]
    try {
      await engine.init(); setProg([0, g.fens.length])
      const r = await runReview(g, engine, depth, (d, t, partial) => { setProg([d, t]); setReview(partial) }, abort.current.signal)
      setReview(r)
      if (r.complete) { await saveReview({ id: gameId(text), savedAt: Date.now(), pgn: text, white: g.headers.White ?? '?', black: g.headers.Black ?? '?', result: g.result, review: r }); refresh() }
    } catch (e) { if (!(e instanceof AnalysisCancelled)) setErr('Engine error: ' + (e as Error).message + '. Check Troubleshooting in the README.') }
    finally { engine.destroy(); engineRef.current = null; setProg(null) }
  }
  const cancel = () => { abort.current?.abort(); engineRef.current?.stop() }

  if (!game || !review) return <Import {...{ err, setErr, start, saved, refresh, depthKey, setDepthKey, open: (s: SavedReview) => { const g = parsePgn(s.pgn); setGame(g); setPgn(s.pgn); setReview(buildReview(g, s.review.evals, s.review.depth)); setPly(0) } }} />

  const complete = review.complete, N = game.fens.length
  const curMove = ply > 0 ? review.moves.find(m => m.ply === ply) : undefined
  const fen = sandbox ? sandbox.fen : game.fens[ply]
  const prevEval = review.evals[ply]?.lines[0]
  const last: [string, string] | null = sandbox ? sandbox.last : ply > 0 ? [game.moves[ply - 1].uci.slice(0, 2), game.moves[ply - 1].uci.slice(2, 4)] : null
  const bestArrow = !sandbox && prevEval?.pv[0] ? ([prevEval.pv[0].slice(0, 2), prevEval.pv[0].slice(2, 4)] as [string, string]) : null
  const bad = review.moves.filter(m => BAD.includes(m.cls)).map(m => m.ply)
  const jump = (dir: 1 | -1) => { const t = dir === 1 ? bad.find(p => p > ply) : [...bad].reverse().find(p => p < ply); if (t) go(t) }
  const onMove = (from: string, to: string, promotion?: string) => {
    const c = new Chess(fen); try { const m = c.move({ from, to, promotion }); setSandbox({ fen: c.fen(), sans: [...(sandbox?.sans ?? []), m.san], last: [from, to] }) } catch { /* illegal */ }
  }
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
    <nav className="tabs"><button className={tab === 'analysis' ? 'on' : ''} onClick={() => setTab('analysis')}>Analysis</button><button className={tab === 'report' ? 'on' : ''} onClick={() => setTab('report')}>Report</button></nav>
    {tab === 'report' ? <Report {...{ game, review }} /> : <main>
      <section className="col-board">
        <div className="board-row"><EvalBar score={review.evals[ply]?.lines[0].score} flipped={flip} />
          <div className="bcol"><PlayerBar hdr={hdr} color={flip ? 'w' : 'b'} />
            <Board fen={fen} flipped={flip} last={last} arrow={bestArrow} badge={curMove && !sandbox ? { sq: game.moves[ply - 1].uci.slice(2, 4), cls: curMove.cls } : null} onMove={onMove} />
            <PlayerBar hdr={hdr} color={flip ? 'b' : 'w'} /></div></div>
        <div className="ctl"><button onClick={() => go(0)} aria-label="First">⏮</button><button onClick={() => go(ply - 1)} aria-label="Previous">◀</button>
          <button onClick={() => setPlaying(!playing)} aria-label="Play/pause">{playing ? '⏸' : '▶'}</button><button onClick={() => go(ply + 1)} aria-label="Next">▶▶</button>
          <button onClick={() => go(N - 1)} aria-label="Last">⏭</button><button onClick={() => setFlip(!flip)}>Flip</button></div>
        {sandbox && <div className="var">Exploring a variation (not saved): <b>{sandbox.sans.join(' ')}</b> <button onClick={() => setSandbox(null)}>Back to game</button> <button onClick={() => setSandbox({ ...sandbox, fen: game.fens[ply], sans: [], last: last ?? ['', ''] }) }>Reset</button></div>}
        <div className="cur">{ply === 0 ? 'Start position' : `Move ${Math.ceil(ply / 2)}${game.moves[ply - 1].color === 'w' ? '.' : '...'} ${game.moves[ply - 1].san}`}</div>
      </section>
      <section className="col-moves">
        <Graph {...{ review, game, ply, onSelect: go }} />
        <div className="filters">{[['all', 'All'], ['bad', 'Errors'], ['blunder', 'Blunders'], ['mistake', 'Mistakes'], ['inaccuracy', 'Inaccuracies'], ['miss', 'Misses']].map(([k, l]) => <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l}</button>)}</div>
        <ol className="moves">{shown.map(m => <li key={m.ply}><button className={`mv ${m.cls} ${m.ply === ply && !sandbox ? 'cur' : ''}`} onClick={() => go(m.ply)}>
          <span className="n">{Math.ceil(m.ply / 2)}{m.color === 'w' ? '.' : '…'}</span> {m.san} <ClassIcon cls={m.cls} /> <small>{formatScore(m.evalAfter)}</small></button></li>)}
          {!shown.length && <li className="empty">{review.moves.length ? 'No moves match this filter.' : 'Waiting for analysis…'}</li>}</ol>
      </section>
      <section className="col-info">
        <Summary review={review} hdr={hdr} />
        <Info {...{ game, review, ply, curMove, sandbox: !!sandbox }} />
        <div className="ctl"><button onClick={() => jump(-1)} disabled={!bad.some(p => p < ply)}>◀ Prev error</button><button onClick={() => jump(1)} disabled={!bad.some(p => p > ply)}>Next error ▶</button></div>
      </section>
    </main>}
  </div>
}

function Info({ game, review, ply, curMove, sandbox }: { game: ParsedGame; review: Review; ply: number; curMove?: ReviewedMove; sandbox: boolean }) {
  const e = review.evals[ply], line = e?.lines[0]
  const mat = material(game.fens[ply])
  return <div className="info">
    <div className="evalbox"><b>{line ? formatScore(line.score) : '…'}</b><small>{line ? `depth ${line.depth}${line.nps ? ` · ${Math.round(line.nps / 1000)}k nps` : ''}${line.nodes ? ` · ${line.nodes.toLocaleString()} nodes` : ''}` : 'not analysed yet'}</small></div>
    {sandbox && <p className="note">Variations are not engine-analysed; the panel shows the main game position.</p>}
    {line && line.pv.length > 0 && <div><h4>Engine line from this position</h4><p className="pv">{pvToSan(game.fens[ply], line.pv, 8).join(' ')}</p>
      <p>Best move: <b>{uciToSan(game.fens[ply], line.pv[0]) ?? '—'}</b></p></div>}
    {curMove && <div className="why"><h4>What was played: {curMove.san} <ClassIcon cls={curMove.cls} /> {CLS_NAME[curMove.cls]}</h4>
      <p>Eval before {formatScore(review.evals[ply - 1]!.lines[0].score)} → after {formatScore(curMove.evalAfter)} ({curMove.winLoss.toFixed(1)} win-% lost by {curMove.color === 'w' ? 'White' : 'Black'}).</p>
      {explain(game, review, curMove).map((t, i) => <p key={i}>{t}</p>)}
      {BAD.includes(curMove.cls) && <p>Best line: <span className="pv">{pvToSan(game.fens[ply - 1], review.evals[ply - 1]!.lines[0].pv, 6).join(' ')}</span></p>}</div>}
    <p className="mat">Material: {mat === 0 ? 'equal' : mat > 0 ? `White +${mat}` : `Black +${-mat}`}</p>
  </div>
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
  const [text, setText] = useState(''); const [user, setUser] = useState(''); const [games, setGames] = useState<{ pgn: string; label: string }[]>([]); const [busy, setBusy] = useState(false); const [bytes, setBytes] = useState(0)
  useEffect(() => { usedBytes().then(setBytes) }, [saved])
  async function fetchGames() {
    setErr(''); setBusy(true); setGames([])
    try {
      const u = user.trim().toLowerCase(); if (!/^[a-z0-9_-]{2,25}$/.test(u)) throw new Error('Enter a valid Chess.com username')
      const a = await fetch(`https://api.chess.com/pub/player/${u}/games/archives`); if (!a.ok) throw new Error(a.status === 404 ? 'User not found' : 'Chess.com API error ' + a.status)
      const arch: string[] = (await a.json()).archives; if (!arch.length) throw new Error('No games found')
      const r = await fetch(arch[arch.length - 1]); if (!r.ok) throw new Error('Chess.com API error ' + r.status)
      const gs = ((await r.json()).games as any[]).filter(g => g.pgn && g.rules === 'chess').reverse().slice(0, 25)
      setGames(gs.map(g => ({ pgn: g.pgn, label: `${g.white.username} (${g.white.rating}) vs ${g.black.username} (${g.black.rating}) · ${g.time_class}` })))
      if (!gs.length) setErr('No standard-chess games in the latest archive.')
    } catch (e) { setErr((e as Error).message + '. You can paste a PGN instead.') } finally { setBusy(false) }
  }
  const n = saved.length, wdl = { w: 0, d: 0, l: 0 }
  saved.forEach(s => { const me = user.trim().toLowerCase(); void me; if (s.result === '1/2-1/2') wdl.d++; else if (s.result === '1-0') wdl.w++; else if (s.result === '0-1') wdl.l++ })
  const accs = saved.map(s => s.review.accuracy.w).filter((x): x is number => x !== null)
  return <div className="app import"><header><b className="logo">♞ EvalMate</b><span className="meta">Local Stockfish game review — nothing is uploaded.</span></header>
    {err && <div className="err" role="alert">{err}</div>}
    <div className="grid">
      <section><h3>Import from Chess.com</h3><p className="note">Uses Chess.com's public game archive for a username (latest month). Only completed games.</p>
        <input placeholder="Chess.com username" value={user} onChange={e => setUser(e.target.value)} onKeyDown={e => e.key === 'Enter' && fetchGames()} /> <button onClick={fetchGames} disabled={busy}>{busy ? 'Loading…' : 'Find games'}</button>
        <ul className="list">{games.map((g, i) => <li key={i}><button onClick={() => start(g.pgn)}>{g.label}</button></li>)}</ul>
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
void useMemo

function PlayerBar({ hdr, color }: { hdr: Record<string, string>; color: 'w' | 'b' }) {
  const name = color === 'w' ? hdr.White : hdr.Black, elo = color === 'w' ? hdr.WhiteElo : hdr.BlackElo
  return <div className="pbar"><span className={`chip ${color}`} /><b>{name ?? '?'}</b>{elo && <span className="elo">({elo})</span>}</div>
}
