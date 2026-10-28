/* ChessIQ dataset tool.  Usage:
 *   npx tsx scripts/dataset.ts build  [--depth 12] [--ref-depth 18]      analyse dataset/games.json -> dataset/generated/analysis.json
 *   npx tsx scripts/dataset.ts import <file.pgn> [--source "..."] [--license "..."] [--depth 12] [--ref-depth 18]
 *   npx tsx scripts/dataset.ts apply-labels <labels.csv> --source "..."   (rows: gameId,ply,san,label) adds chesscom-verified labels YOU read in Chess.com
 *   npx tsx scripts/dataset.ts puzzles <lichess_db_puzzle.csv> [--limit 200]   convert Lichess puzzles (CC0) -> dataset/imported/puzzles.json
 *   npx tsx scripts/dataset.ts report [--json]                              metrics (precision/recall per class, per provenance)
 */
import fs from 'node:fs'
import { parsePgn } from '../src/core/pgn'
import { terminalEval } from '../src/core/review'
import { newEngine } from './lib/node-engine'
import { evaluateDataset } from '../src/dataset/evaluate'
import { parsePuzzleCsv } from '../src/dataset/puzzles'
import { validateAll } from '../src/dataset/validate'
import { CLASSES, type GameSource, type LabelRecord, type Aggregate, type StoredAnalysis } from '../src/dataset/types'
import type { PositionEval } from '../src/core/types'
const arg = (n: string, d?: string) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d }
const rd = <T>(p: string, d: T): T => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : d)
const wr = (p: string, v: unknown) => fs.writeFileSync(p, JSON.stringify(v, null, p.includes('generated') ? 0 : 1))
const slim = (e: PositionEval): PositionEval => ({ fen: e.fen, depth: e.depth, lines: e.lines.map(l => ({ multipv: l.multipv, score: l.score, depth: l.depth, pv: l.pv.slice(0, 8) })) })
async function analyseGames(games: GameSource[], depth: number, refDepth: number, into: StoredAnalysis) {
  for (const g of games) {
    const p = parsePgn(g.pgn); const res: Record<string, PositionEval[]> = {}
    for (const [k, d] of [['testEvals', depth], ['refEvals', refDepth]] as const) {
      const e = await newEngine(2); const out: PositionEval[] = []
      for (const f of p.fens) out.push(slim(terminalEval(f) ?? await e.analyze(f, d, 120000))); e.destroy(); res[k] = out
      console.log(`  ${g.id} ${k} depth ${d}: ${out.length} positions`)
    }
    into.games[g.id] = { testEvals: res.testEvals, refEvals: res.refEvals }
  }
}
const load = () => ({ games: rd<GameSource[]>('dataset/games.json', []).concat(rd('dataset/imported/games.json', [])), verified: rd<LabelRecord[]>('dataset/labels.chesscom.json', []).concat(rd('dataset/imported/labels.chesscom.json', [])),
  manual: rd<LabelRecord[]>('dataset/labels.manual.json', []), aggregates: rd<Aggregate[]>('dataset/aggregates.chesscom.json', []),
  analysis: rd<StoredAnalysis>('dataset/generated/analysis.json', { engine: '', testDepth: 0, refDepth: 0, generatedAt: '', games: {} }) })
const pct = (x: number | null) => (x === null ? '  -  ' : (x * 100).toFixed(0).padStart(4) + '%')
async function main() {
  const cmd = process.argv[2]
  if (cmd === 'build') {
    const depth = +(arg('depth', '12')!), ref = +(arg('ref-depth', '18')!), d = load()
    const a: StoredAnalysis = { engine: 'stockfish-19-lite-single (MultiPV 2)', testDepth: depth, refDepth: ref, generatedAt: new Date().toISOString(), games: {} }
    await analyseGames(d.games, depth, ref, a); wr('dataset/generated/analysis.json', a); console.log('wrote dataset/generated/analysis.json')
  } else if (cmd === 'import') {
    const f = process.argv[3]; if (!f || !fs.existsSync(f)) throw new Error('usage: import <file.pgn>'); const depth = +(arg('depth', '12')!), ref = +(arg('ref-depth', '18')!)
    const chunks = fs.readFileSync(f, 'utf8').split(/\n\s*\n(?=\[Event )/).map(s => s.trim()).filter(Boolean)
    const prev = rd<GameSource[]>('dataset/imported/games.json', []), games: GameSource[] = []; const stamp = Date.now().toString(36)
    chunks.forEach((pgn, i) => { try { parsePgn(pgn); games.push({ id: `imp-${stamp}-${i + 1}`, title: `${f} #${i + 1}`, pgn, license: arg('license', 'UNKNOWN - set --license')!, origin: arg('source', f)!, tags: ['imported'] }) } catch (e) { console.warn(`skip game ${i + 1}: ${(e as Error).message}`) } })
    const an = rd<StoredAnalysis>('dataset/imported/analysis.json', { engine: 'stockfish-19-lite-single (MultiPV 2)', testDepth: depth, refDepth: ref, generatedAt: '', games: {} })
    if (an.testDepth !== depth || an.refDepth !== ref) { an.testDepth = depth; an.refDepth = ref; an.games = {} }
    await analyseGames(games, depth, ref, an); an.generatedAt = new Date().toISOString(); wr('dataset/imported/games.json', prev.concat(games)); wr('dataset/imported/analysis.json', an)
    const { predict } = await import('../src/dataset/evaluate'); const pr = predict(games, an)
    const csv = ['gameId,ply,san,classifier_label,chesscom_label']; for (const g of games) for (const m of pr[g.id].review.moves) csv.push(`${g.id},${m.ply},${m.san},${m.cls},`)
    fs.writeFileSync('dataset/imported/labels-template.csv', csv.join('\n')); console.log(`imported ${games.length} game(s); fill the chesscom_label column ONLY from a real Chess.com review, then run apply-labels`)
  } else if (cmd === 'apply-labels') {
    const f = process.argv[3], src = arg('source'); if (!f || !src) throw new Error('usage: apply-labels <csv> --source "where you read these labels"')
    const out = rd<LabelRecord[]>('dataset/imported/labels.chesscom.json', []); let n = 0
    for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/).slice(1)) { const [gameId, ply, san, , label] = line.split(','); if (!label?.trim()) continue
      const l = label.trim().toLowerCase(); if (!(CLASSES as string[]).includes(l)) { console.warn('skip unknown label', l); continue }
      out.push({ id: `cc-${gameId}-${ply}`, gameId, ply: +ply, san, label: l as LabelRecord['label'], provenance: 'chesscom-verified', source: src, testable: true }); n++ }
    wr('dataset/imported/labels.chesscom.json', out); console.log(`added ${n} verified label(s)`)
  } else if (cmd === 'puzzles') {
    const f = process.argv[3]; if (!f || !fs.existsSync(f)) throw new Error('usage: puzzles <lichess_db_puzzle.csv>')
    const r = parsePuzzleCsv(fs.readFileSync(f, 'utf8'), +(arg('limit', '200')!)); wr('dataset/imported/puzzles.json', r.puzzles); console.log(`wrote ${r.puzzles.length} puzzles (${r.skipped} skipped)`)
  } else if (cmd === 'report') {
    const d = load(); const errs = validateAll(d.games, [...d.verified, ...d.manual], d.aggregates, d.analysis); if (errs.length) { console.error('DATASET INVALID:\n' + errs.join('\n')); process.exit(1) }
    const r = evaluateDataset(d.games, d.verified, d.manual, d.aggregates, d.analysis)
    if (process.argv.includes('--json')) { console.log(JSON.stringify({ verified: r.verified, manual: r.manual, engine: { ...r.engine, detail: undefined }, coverage: r.coverage }, null, 1)); return }
    console.log(`Engine: ${d.analysis.engine} | classifier depth ${d.analysis.testDepth} | reference depth ${d.analysis.refDepth}\n`)
    console.log(`== Chess.com-VERIFIED labels: ${r.verified.correct}/${r.verified.n} correct (n is far too small for precision/recall; ${r.verified.untestable.length} more cannot be tested without a PGN)`)
    r.verified.rows.forEach(x => console.log(`   ${x.ok ? 'PASS' : 'FAIL'} ${x.id}: truth=${x.truth} predicted=${x.predicted}`))
    console.log(`\n== Manually-reviewed (assistant, NOT independent): ${r.manual.correct}/${r.manual.n}`); r.manual.rows.filter(x => !x.ok).forEach(x => console.log(`   differs ${x.id}: expected=${x.truth} predicted=${x.predicted}`))
    console.log(`\n== Engine-derived reference (depth ${d.analysis.refDepth}) vs classifier (depth ${d.analysis.testDepth}): ${r.engine.n} moves, exact-bucket agreement ${pct(r.engine.accuracy)}`)
    console.log('   class        support  predicted  precision  recall   F1    status'); r.engine.stats.forEach(s => console.log(`   ${s.label.padEnd(11)} ${String(s.support).padStart(7)} ${String(s.predicted).padStart(9)}   ${pct(s.precision)}    ${pct(s.recall)} ${pct(s.f1)}   ${s.status}`))
    console.log('\n== Label coverage (examples per class and provenance)'); console.log('   class        ' + Object.keys(r.coverage.best).map(k => k.slice(0, 9).padStart(10)).join('')); for (const c of CLASSES) console.log('   ' + c.padEnd(12) + Object.values(r.coverage[c]).map(n => String(n).padStart(10)).join(''))
    console.log('\nClasses with NO verified Chess.com example:', CLASSES.filter(c => !r.coverage[c]['chesscom-verified'] || !d.verified.some(l => l.label === c && l.testable)).join(', '))
  } else console.log(fs.readFileSync('scripts/dataset.ts', 'utf8').split('*/')[0])
}
main().catch(e => { console.error(e.message); process.exit(1) })
