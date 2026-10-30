import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import { validateAll } from '../src/dataset/validate'
import { evaluateDataset, predict } from '../src/dataset/evaluate'
import { perClass } from '../src/dataset/metrics'
import { referenceLabel, lossFamily } from '../src/dataset/reference'
import { parsePuzzleCsv, puzzleTestCase } from '../src/dataset/puzzles'
import { toDatasetRecord } from '../src/dataset/record'
import { parsePgn } from '../src/core/pgn'
import { buildReview } from '../src/core/review'
import { CLASSES, PROVENANCE, MIN_SUPPORT, type GameSource, type LabelRecord, type Aggregate, type StoredAnalysis } from '../src/dataset/types'
const rd = <T>(p: string) => JSON.parse(fs.readFileSync(p, 'utf8')) as T
const games = rd<GameSource[]>('dataset/games.json'), verified = rd<LabelRecord[]>('dataset/labels.chesscom.json'), manual = rd<LabelRecord[]>('dataset/labels.manual.json')
const aggs = rd<Aggregate[]>('dataset/aggregates.chesscom.json'), analysis = rd<StoredAnalysis>('dataset/generated/analysis.json')
const R = evaluateDataset(games, verified, manual, aggs, analysis)

describe('dataset integrity', () => {
  it('validates (schema, PGNs, label->move alignment, analysis matches games)', () => expect(validateAll(games, [...verified, ...manual], aggs, analysis)).toEqual([]))
  it('label files keep provenance separate', () => {
    expect(verified.every(l => l.provenance === 'chesscom-verified')).toBe(true)
    expect(manual.every(l => l.provenance === 'manually-reviewed')).toBe(true)
    expect(aggs.every(a => a.provenance === 'chesscom-verified')).toBe(true)
    expect([...verified, ...manual].every(l => PROVENANCE.includes(l.provenance)))
  })
  it('never stores our classifier output as a label', () => { for (const l of [...verified, ...manual]) expect(l.source).not.toMatch(/classifier|EvalMate predicted/i) })
  it('untestable verified labels explain what is missing', () => verified.filter(l => !l.testable).forEach(l => expect(l.missing).toBeTruthy()))
  it('analysis was produced with real engine settings', () => { expect(analysis.engine).toMatch(/stockfish/); expect(analysis.refDepth).toBeGreaterThan(analysis.testDepth) })
  it('catches a stale analysis (FEN mismatch)', () => {
    const bad = JSON.parse(JSON.stringify(analysis)) as StoredAnalysis; bad.games['opera-1858'].testEvals[3].fen = 'x'
    expect(validateAll(games, [], [], bad).join()).toMatch(/FEN mismatch/)
  })
  it('catches a SAN mismatch in a label', () => expect(validateAll(games, [{ ...manual[0], san: 'Qa1' }], [], undefined).join()).toMatch(/SAN mismatch/))
})
describe('regression: Chess.com-VERIFIED labels (hard requirement)', () => {
  it('has testable verified labels', () => expect(R.verified.n).toBeGreaterThanOrEqual(2))
  for (const l of verified.filter(x => x.testable)) it(`${l.id}: ${l.san} is ${l.label}`, () => expect(R.verified.rows.find(r => r.id === l.id)!.predicted).toBe(l.label))
})
describe('manually-reviewed labels (assistant-reviewed, NOT independent: tracked, not authoritative)', () => {
  it('reports every disagreement instead of hiding it', () => {
    const wrong = R.manual.rows.filter(r => !r.ok).map(r => `${r.id}: expected ${r.truth}, got ${r.predicted}`)
    console.log(`manual labels: ${R.manual.correct}/${R.manual.n} agree`, wrong)
    expect(R.manual.correct / R.manual.n).toBeGreaterThanOrEqual(0.75) // regression guard, not a claim of correctness
  })
  it('known hard cases: mate-allowing moves are blunders, mating moves are not blunders', () => { for (const id of ['man-fools-2w-g4', 'man-scholar-3b-nf6', 'man-legal-5b-bxd1', 'man-opera-17w-rd8']) expect(R.manual.rows.find(r => r.id === id)!.ok).toBe(true) })
})
describe('engine-derived reference vs classifier (depth sensitivity)', () => {
  it('compares a meaningful number of moves', () => expect(R.engine.n).toBeGreaterThan(100))
  it('exact-bucket agreement does not regress', () => { console.log('engine-derived exact agreement', R.engine.accuracy, JSON.stringify(R.engine.stats.map(s => [s.label, s.support, s.f1 === null ? null : +s.f1.toFixed(2), s.status]))); expect(R.engine.accuracy!).toBeGreaterThanOrEqual(0.7) })
  it('never claims reliability without enough evidence', () => R.engine.stats.forEach(s => { if (s.support < MIN_SUPPORT) expect(s.status).toBe('insufficient-evidence') }))
})
describe('consistency across the whole dataset (every move, every game)', () => {
  it('each move has exactly one class; counts equal the move list; evals agree with graph data', () => {
    const P = predict(games, analysis)
    for (const g of games) { const { game, review } = P[g.id]; expect(review.moves.length).toBe(game.moves.length); expect(review.complete).toBe(true)
      for (const s of ['w', 'b'] as const) { const n = review.moves.filter(m => m.color === s).length; expect(Object.values(review.counts[s]).reduce((a, b) => a + (b ?? 0), 0)).toBe(n) }
      review.moves.forEach(m => { expect(CLASSES).toContain(m.cls); expect(review.evals[m.ply]!.lines[0].score).toEqual(m.evalAfter) }) }
  })
  it('covers difficult cases (tags present in the data)', () => { const tags = new Set(games.flatMap(g => g.tags)); for (const t of ['sound-sacrifice', 'losing-sacrifice', 'checkmate-sequence', 'eval-sign-change', 'missed-win', 'forced-move', 'en-passant', 'castling', 'promotion', 'draw']) expect(tags).toContain(t) })
  it('no NaN or undefined anywhere in classifier output', () => { const P = predict(games, analysis); for (const g of games) P[g.id].review.moves.forEach(m => { expect(Number.isFinite(m.winLoss)).toBe(true); expect(Number.isFinite(m.winBefore)).toBe(true) }) })
})
describe('metrics module', () => {
  it('precision/recall are null (not NaN/0) when undefined', () => { const r = perClass([['a', 'a']], ['a', 'b']); expect(r.stats[1].precision).toBeNull(); expect(r.stats[1].recall).toBeNull() })
  it('computes precision/recall/F1 and flags small samples', () => {
    const pairs: [string, string][] = [['a', 'a'], ['a', 'b'], ['b', 'b'], ['b', 'b']]; const s = perClass(pairs, ['a', 'b']).stats
    expect(s[0].precision).toBe(1); expect(s[0].recall).toBe(0.5); expect(s[1].precision).toBeCloseTo(2 / 3); expect(s[0].status).toBe('insufficient-evidence')
  })
  it('only labels reliable with enough support and high F1', () => { const pairs: [string, string][] = Array.from({ length: 40 }, () => ['a', 'a']); expect(perClass(pairs, ['a']).stats[0].status).toBe('reliable') })
})
describe('reference labeller + family mapping', () => {
  const ev = (cp: number, pv = ['e2e4']) => ({ fen: '', depth: 18, lines: [{ multipv: 1, score: { cp }, pv, depth: 18 }] })
  it('loss buckets', () => { expect(referenceLabel(ev(0), ev(0), 'e2e4', 'w')).toBe('best'); expect(referenceLabel(ev(0), ev(-500), 'a2a3', 'w')).toBe('blunder'); expect(referenceLabel(ev(0), ev(500), 'a7a6', 'b')).toBe('blunder') })
  it('special classes collapse to a loss family; book is not comparable', () => { expect(lossFamily('brilliant', 0)).toBe('best'); expect(lossFamily('great', 0)).toBe('best'); expect(lossFamily('book', 0)).toBeNull(); expect(lossFamily('miss', 15)).toBe('mistake') })
})
describe('puzzle importer (Lichess CSV format; fixture below is SYNTHETIC, only tests the parser)', () => {
  const csv = 'PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags\nFIXTURE1,6k1/1p3ppp/8/8/8/8/5PPP/R3K3 b - - 0 1,b7b6 a1a8,1000,80,90,10,mateIn1 backRankMate,https://example.invalid,\nBAD,not-a-fen,e2e4 e7e5,1,1,1,1,x,,'
  it('parses valid rows, skips invalid ones, never guesses', () => { const r = parsePuzzleCsv(csv); expect(r.puzzles.length).toBe(1); expect(r.skipped).toBe(1); expect(r.puzzles[0].themes).toEqual(['mateIn1', 'backRankMate']); expect(r.puzzles[0].provenance).toBe('puzzle-theme-derived') })
  it('derives the solver position and solution', () => { const t = puzzleTestCase(parsePuzzleCsv(csv).puzzles[0]); expect(t.solutionUci).toBe('a1a8'); expect(t.fen).toContain(' w ') })
  it('the solution move to a mate-in-1 puzzle is classified as a good move by our classifier (theme test, not a Chess.com label)', () => {
    const t = puzzleTestCase(parsePuzzleCsv(csv).puzzles[0]), g = parsePgn(`[SetUp "1"]\n[FEN "${t.fen}"]\n\n1. Ra8# 1-0`), mate = { fen: g.fens[1], depth: 0, lines: [{ multipv: 1, pv: [], depth: 0, score: { cp: 10000, mate: 0 } }] }
    const pre = { fen: g.fens[0], depth: 18, lines: [{ multipv: 1, pv: ['a1a8'], depth: 18, score: { cp: 9999, mate: 1 } }] }
    expect(buildReview(g, [pre, mate], 18).moves[0].cls).toBe('best')
  })
})
describe('export from the extension', () => {
  it('produces a record with predictions kept apart from (empty) labels', () => {
    const g = games.find(x => x.id === 'fools-mate')!, pg = parsePgn(g.pgn), rec = toDatasetRecord(pg, g.pgn, predict([g], analysis)[g.id].review)
    expect(rec.schema).toMatch(/dataset-record/); expect(rec.predictions.length).toBe(4); rec.predictions.forEach(p => expect(p.labels).toEqual([]))
  })
})
describe('Chess.com aggregates are stored but never compared without a PGN', () => { it('marks them untestable', () => aggs.forEach(a => expect(a.testable).toBe(false))) })
