import { describe, it, expect } from 'vitest'
import { parseInfo, winPct, winPctFor, formatScore } from '../src/core/eval'
import { classifyMove } from '../src/core/classify'
import { moveAccuracy, sideAccuracy } from '../src/core/accuracy'
import { parsePgn, PgnError } from '../src/core/pgn'
import { lookupOpening } from '../src/core/openings'
import type { PositionEval } from '../src/core/types'
import { assignPhases, rawPhase } from '../src/core/phase'
import { estimateRating, scaledError } from '../src/core/rating'
import { materialDeficit, seeSacrifice, materialLead } from '../src/core/sacrifice'
import { buildReview, terminalEval } from '../src/core/review'
const pe = (cp: number, pv = ['e2e4'], second?: number): PositionEval => ({ fen: '', depth: 10, lines: [
  { multipv: 1, score: { cp }, pv, depth: 10 }, ...(second !== undefined ? [{ multipv: 2, score: { cp: second }, pv: ['a2a3'], depth: 10 }] : [])] })
describe('eval perspective', () => {
  it('negates score when black to move', () => expect(parseInfo('info depth 10 multipv 1 score cp 50 nodes 5 pv e7e5', 'b')!.score.cp).toBe(-50))
  it('keeps White-to-move score', () => expect(parseInfo('info depth 10 score cp 50 pv e2e4', 'w')!.score.cp).toBe(50))
  it('handles mate, both sides', () => {
    expect(parseInfo('info depth 9 score mate 3 pv e2e4', 'w')!.score.mate).toBe(3)
    const s = parseInfo('info depth 9 score mate 2 pv e2e4', 'b')!.score; expect(s.mate).toBe(-2); expect(s.cp).toBeLessThan(-9000)
  })
  it('ignores bounds and non-pv lines', () => { expect(parseInfo('info depth 1 score cp 5 lowerbound pv e2e4', 'w')).toBeNull(); expect(parseInfo('info string x', 'w')).toBeNull() })
  it('win% symmetric and bounded', () => { expect(winPct(0)).toBeCloseTo(50); expect(winPct(1e9)).toBeLessThanOrEqual(100); expect(winPctFor({ cp: 300 }, 'b')).toBeCloseTo(100 - winPct(300)) })
  it('formats', () => { expect(formatScore({ cp: 123 })).toBe('+1.23'); expect(formatScore({ cp: 9998, mate: 2 })).toBe('+M2') })
})
describe('classification', () => {
  const f = (side: 'w'|'b', uci: string, extra = {}) => ({ side, playedUci: uci, isBook: false, isSacrifice: false, ...extra })
  it('best when matches engine', () => expect(classifyMove(pe(30), pe(30), f('w', 'e2e4')).cls).toBe('best'))
  it('black blunder uses black perspective', () => {
    // before: equal. After black's move White is +5 => black lost a lot
    expect(classifyMove(pe(0), pe(500), f('b', 'a7a6')).cls).toBe('blunder')
    // White eval dropping is GOOD for black
    expect(classifyMove(pe(0), pe(-300), f('b', 'a7a6')).winLoss).toBe(0)
  })
  it('mistake / inaccuracy bands', () => {
    expect(classifyMove(pe(0), pe(-150), f('w', 'h2h3')).cls).toBe('mistake')
    expect(classifyMove(pe(0), pe(-70), f('w', 'h2h3')).cls).toBe('inaccuracy')
  })
  it('miss needs an opponent error that created the chance', () => {
    expect(classifyMove(pe(300), pe(100), f('w', 'h2h3', { prevLoss: 25 })).cls).toBe('miss')
    expect(classifyMove(pe(300), pe(100), f('w', 'h2h3', { prevLoss: 0 })).cls).toBe('mistake') // no opponent error => ordinary mistake
    expect(classifyMove(pe(300), pe(-600), f('w', 'h2h3', { prevLoss: 25 })).cls).toBe('blunder') // collapse is a blunder, not a miss
  })
  it('missing a forced mate after an opponent error is a miss', () => {
    const b: PositionEval = { fen: '', depth: 10, lines: [{ multipv: 1, score: { cp: 9997, mate: 3 }, pv: ['d1h5'], depth: 10 }] }
    expect(classifyMove(b, pe(300), f('w', 'h2h3', { prevLoss: 20 })).cls).toBe('miss')
  })
  it('black perspective for miss', () => expect(classifyMove(pe(-300), pe(0), f('b', 'h7h6', { prevLoss: 25 })).cls).toBe('miss'))
  it('great = only move', () => expect(classifyMove(pe(0, ['e2e4'], -400), pe(0), f('w', 'e2e4')).cls).toBe('great'))
  it('brilliant requires sacrifice + only-move + not already winning', () => {
    expect(classifyMove(pe(0, ['e2e4'], -400), pe(0), f('w', 'e2e4', { isSacrifice: true })).cls).toBe('brilliant')
    expect(classifyMove(pe(900, ['e2e4'], 100), pe(900), f('w', 'e2e4', { isSacrifice: true, materialBefore: 6 })).cls).not.toBe('brilliant')
    // sacrifice + best move + equal position => brilliant even without an only-move gap
    expect(classifyMove(pe(0), pe(0), f('w', 'e2e4', { isSacrifice: true })).cls).toBe('brilliant')
    // recaptures are never brilliant/great
    expect(classifyMove(pe(0, ['e2e4'], -400), pe(0), f('w', 'e2e4', { isSacrifice: true, isRecapture: true })).cls).toBe('best')
    // a sacrifice that loses the position is not brilliant
    expect(classifyMove(pe(0), pe(-500), f('w', 'h2h3', { isSacrifice: true })).cls).toBe('blunder')
  })
  it('forced single legal move is never great', () => expect(classifyMove(pe(0, ['e2e4'], -400), pe(0), f('w', 'e2e4', { onlyLegal: true })).cls).toBe('best'))
  it('non-top move within 0.5 of best only counts as best if the engine listed it', () => {
    const b: PositionEval = { fen: '', depth: 10, lines: [{ multipv: 1, score: { cp: 30 }, pv: ['e2e4'], depth: 10 }, { multipv: 2, score: { cp: 28 }, pv: ['d2d4'], depth: 10 }] }
    expect(classifyMove(b, pe(30), f('w', 'd2d4')).cls).toBe('best')
    expect(classifyMove(b, pe(30), f('w', 'a2a3')).cls).toBe('excellent')
  })
  it('uses the played move\'s own line when listed (no depth noise)', () => {
    const b: PositionEval = { fen: '', depth: 10, lines: [{ multipv: 1, score: { cp: 0 }, pv: ['e2e4'], depth: 10 }, { multipv: 2, score: { cp: -150 }, pv: ['d2d4'], depth: 10 }] }
    expect(classifyMove(b, pe(500), f('w', 'd2d4')).winLoss).toBeCloseTo(50 - winPct(-150), 5)
  })
  it('allowing mate is a blunder', () => expect(classifyMove(pe(0), { fen: '', depth: 1, lines: [{ multipv: 1, pv: [], depth: 1, score: { cp: -9997, mate: -3 } }] }, f('w', 'h2h3')).cls).toBe('blunder'))
  it('book wins when flagged', () => expect(classifyMove(pe(0), pe(0), f('w', 'e2e4', { isBook: true })).cls).toBe('book'))
})
describe('accuracy', () => {
  it('perfect = ~100, bad is low, never NaN', () => { expect(moveAccuracy(0)).toBeCloseTo(100, 0); expect(moveAccuracy(100)).toBeLessThan(5); expect(moveAccuracy(NaN)).toBe(0) })
  it('null with no moves', () => expect(sideAccuracy([])).toBeNull())
})
describe('pgn', () => {
  it('parses with comments, clocks and headers', () => { const g = parsePgn('[Event "x"]\n[White "A"]\n[Black "B"]\n[Result "1-0"]\n\n1. e4 {[%clk 0:10:00]} e5 2. Nf3 (2. Bc4) Nc6 1-0'); expect(g.moves.map(m => m.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6']); expect(g.fens.length).toBe(5); expect(g.moves[0].uci).toBe('e2e4') })
  it('rejects illegal / empty / variants', () => { expect(() => parsePgn('1. e4 e4')).toThrow(PgnError); expect(() => parsePgn('  ')).toThrow(PgnError); expect(() => parsePgn('[Variant "Chess960"]\n\n1. e4 e5')).toThrow(/Unsupported variant/) })
  it('honours custom FEN', () => { const fen = '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1'; const g = parsePgn(`[SetUp "1"]\n[FEN "${fen}"]\n\n1. e4`); expect(g.startFen).toBe(fen); expect(g.moves[0].san).toBe('e4') })
  it('opening lookup', () => { const g = parsePgn('1. e4 e5 2. Nf3 Nc6 3. Bb5'); expect(lookupOpening(g.fens[5])!.name).toMatch(/Ruy Lopez/) })
})

describe('phase', () => {
  it('start is opening, bare kings+pawns is endgame', () => { expect(rawPhase(parsePgn('1. e4').fens[0])).toBe('opening'); expect(rawPhase('4k3/pppp4/8/8/8/8/PPPP4/4K3 w - - 0 1')).toBe('endgame') })
  it('is monotone and covers every move exactly once', () => {
    const g = parsePgn('1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. d3 Bc5 5. O-O d6 6. Nc3 O-O 7. Bg5 h6 8. Bh4 g5 9. Bg3 Bg4 10. h3 Bxf3 11. Qxf3 Nd4 12. Qd1 Nxc2 13. Qxc2 Qe7')
    const p = assignPhases(g.fens.slice(0, g.moves.length)); expect(p.length).toBe(g.moves.length)
    const rank = { opening: 0, middlegame: 1, endgame: 2 }; for (let i = 1; i < p.length; i++) expect(rank[p[i]]).toBeGreaterThanOrEqual(rank[p[i - 1]])
    expect(p[0]).toBe('opening')
  })
})
describe('rating', () => {
  it('scaled error is zero for best move and sign-safe', () => { expect(scaledError(50, 50)).toBe(0); expect(scaledError(50, -50)!).toBeGreaterThan(0); expect(scaledError(900, 0)).toBeNull() })
  it('error near zero is larger than the same cp error in a lopsided position', () => expect(scaledError(0, -100)!).toBeGreaterThan(scaledError(250, 150)!))
  it('unavailable with too few moves, never NaN', () => { const r = estimateRating([0.1, 0.1]); expect(r.rating).toBeNull(); expect(r.reason).toBeTruthy() })
  it('monotone: fewer errors => higher rating; rounded; refuses out-of-range instead of clamping', () => {
    const lo = estimateRating(Array(20).fill(0.18)).rating!, hi = estimateRating(Array(20).fill(0.06)).rating!
    expect(hi).toBeGreaterThan(lo); expect(hi % 50).toBe(0)
    const top = estimateRating(Array(20).fill(0)); expect(top.rating).toBeNull(); expect(top.reason).toMatch(/outside/)
    expect(estimateRating(Array(20).fill(2)).rating).toBeNull()
  })
})
describe('sacrifice detection', () => {
  const fen = parsePgn('1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5 d5 5. exd5 Nxd5').fens.at(-1)!
  it('knight for pawn along the engine line is a sacrifice', () => expect(materialDeficit(fen, 'g5f7', ['e8f7', 'd1f3', 'f7e6', 'b1c3'])).toBe(2))
  it('even trade is not', () => expect(materialDeficit(fen, 'g5f7', ['e8f7', 'd1f3', 'f7e6', 'f3d5'])!).toBeLessThan(2))
  it('too-short PV cannot be judged', () => expect(materialDeficit(fen, 'g5f7', ['e8f7'])).toBeNull())
  it('queen sac ending in mate counts (Opera Game)', () => {
    const g = parsePgn('1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7')
    expect(materialDeficit(g.fens.at(-1)!, 'b3b8', ['d7b8', 'd1d8'])).toBeGreaterThanOrEqual(8)
  })
})
describe('review invariants (synthetic evals)', () => {
  it('terminal positions get exact evals', () => { const e = terminalEval(parsePgn('1. f3 e5 2. g4 Qh4#').fens.at(-1)!)!; expect(e.lines[0].score.mate).toBe(0); expect(e.lines[0].score.cp).toBe(-10000) })
  it('book is contiguous: leaving theory ends Book (no re-entry after ply 12)', () => {
    const g = parsePgn('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Na5 10. Bc2 c5 11. d4 Qc7 12. Nbd2 cxd4 13. cxd4 Nc6 14. Nb3 a5 15. Be3 a4 16. Nbd2 Bd7 17. Rc1 Qb7 18. Qe2 Rac8 19. Bb1 Bd8 20. Nf1 Nb4')
    const ev = g.fens.map(fen => ({ fen, depth: 10, lines: [{ multipv: 1, score: { cp: 20 }, pv: ['a2a3', 'a7a6', 'a3a4', 'a6a5'], depth: 10 }] }))
    const r = buildReview(g, ev, 10); const firstNon = r.moves.findIndex(m => m.cls !== 'book')
    expect(firstNon).toBeGreaterThan(5); r.moves.slice(firstNon).filter(m => m.ply > 12).forEach(m => expect(m.cls).not.toBe('book'))
  })
  it('counts sum to move count and match the move list', () => {
    const g = parsePgn('1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Be7 5. e3 O-O 6. Nf3 h6 7. Bh4 b6 8. cxd5 exd5 9. Bd3 Bb7 10. O-O Nbd7')
    const ev = g.fens.map((fen, i) => ({ fen, depth: 10, lines: [{ multipv: 1, score: { cp: (i % 5) * 40 - 60 }, pv: ['a2a3', 'a7a6', 'a3a4', 'a6a5'], depth: 10 }] }))
    const r = buildReview(g, ev, 10)
    for (const s of ['w', 'b'] as const) { const n = r.moves.filter(m => m.color === s).length; expect(Object.values(r.counts[s]).reduce((a, b) => a + (b ?? 0), 0)).toBe(n)
      for (const [k, v] of Object.entries(r.counts[s])) expect(r.moves.filter(m => m.color === s && m.cls === k).length).toBe(v) }
    expect(r.moves.length).toBe(g.moves.length); expect(r.moves.every(m => ['opening', 'middlegame', 'endgame'].includes(m.phase))).toBe(true)
  })
})

describe('static exchange sacrifice (piece left en prise)', () => {
  // Position before 17.Bxa6, which Chess.com's review marks Brilliant: bishop (3) takes a pawn (1) and can be taken by the b7 pawn.
  const bxa6 = '2kr3r/1pp1ppb1/p1n3pp/2Nq1b2/3P1B2/2PB4/PP2QPPP/R3R1K1 w - - 0 17'
  it('Bxa6: bishop for pawns is a sacrifice', () => { const r = seeSacrifice(bxa6, 'd3a6'); expect(r.sacrifice).toBe(true); expect(r.net).toBeLessThanOrEqual(-1) })
  it('even trade (knight takes knight, pawn recaptures) is not', () => expect(seeSacrifice('4k3/8/4p3/3n4/8/2N5/8/4K3 w - - 0 1', 'c3d5').sacrifice).toBe(false))
  it('adequately defended developing move is not', () => expect(seeSacrifice('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', 'g1f3').sacrifice).toBe(false))
  it('pawn moves never count', () => expect(seeSacrifice('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', 'd2d4').sacrifice).toBe(false))
  it('queen thrown away for nothing counts (net loss)', () => expect(seeSacrifice('r3k3/8/8/8/8/1Q6/8/4K3 w - - 0 1', 'b3b8').sacrifice).toBe(true))
  it('material lead is from the side to move', () => { expect(materialLead('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).toBe(0); expect(materialLead('4k3/8/8/8/8/8/8/Q3K3 w - - 0 1')).toBe(9); expect(materialLead('4k3/8/8/8/8/8/8/Q3K3 b - - 0 1')).toBe(-9) })
  it('brilliant is blocked when already far ahead in material', () => {
    const b = pe(900, ['e2e4'], 800), mk = (lead: number) => classifyMove(b, pe(900), { side: 'w', playedUci: 'e2e4', isBook: false, isSacrifice: true, materialBefore: lead }).cls
    expect(mk(0)).toBe('brilliant'); expect(mk(6)).not.toBe('brilliant')
  })
})

describe('mate-allowed floor', () => {
  const mate = (m: number): PositionEval => ({ fen: '', depth: 10, lines: [{ multipv: 1, score: { cp: -9990, mate: m }, pv: ['a7a6'], depth: 10 }] })
  const f = { side: 'b' as const, playedUci: 'b7a6', isBook: false }
  it('already-lost position + move that allows forced mate => Mistake (not Inaccuracy)', () => expect(classifyMove(pe(700), { fen: '', depth: 10, lines: [{ multipv: 1, score: { cp: 9990, mate: 2 }, pv: [], depth: 10 }] }, f).cls).toBe('mistake'))
  it('no floor when the mate was already forced before the move', () => expect(classifyMove({ fen: '', depth: 10, lines: [{ multipv: 1, score: { cp: 9990, mate: 3 }, pv: ['x'], depth: 10 }] }, { fen: '', depth: 10, lines: [{ multipv: 1, score: { cp: 9990, mate: 2 }, pv: [], depth: 10 }] }, f).cls).not.toBe('mistake'))
  it('never lowers a best move', () => expect(classifyMove(pe(700, ['b7a6']), { fen: '', depth: 10, lines: [{ multipv: 1, score: { cp: 9990, mate: 2 }, pv: [], depth: 10 }] }, f).cls).toBe('best'))
  void mate
})
