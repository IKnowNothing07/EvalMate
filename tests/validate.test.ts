import { describe, it, expect } from 'vitest'
import { spawn } from 'node:child_process'
import { Engine, type Transport } from '../src/core/engine'
import { parsePgn } from '../src/core/pgn'
import { runReview } from '../src/core/review'
const T = (): Transport => { const p = spawn('node', ['public/engine/stockfish-19-lite-single.js']); let cb = (_: string) => {}, buf = ''
  p.stdout.on('data', d => { buf += d; const ls = buf.split('\n'); buf = ls.pop()!; ls.forEach(l => cb(l)) })
  return { post: c => p.stdin.write(c + '\n'), onLine: f => { cb = f }, onError: f => p.on('error', f), terminate: () => p.kill() } }
const GAMES: Record<string, string> = {
  opera: '1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0',
  enpassant_promo: '1. e4 a6 2. e5 d5 3. exd6 cxd6 4. Nf3 Nc6 5. d4 Bg4 6. Bd3 e6 7. O-O Nf6 8. Nc3 Be7 9. h3 Bh5 10. g4 Bg6 11. Bxg6 hxg6 12. Re1 O-O 13. Bg5 Nd5 14. Nxd5 exd5 15. Bxe7 Qxe7 16. Qd2 Rfe8 17. Qg5 Qxg5 18. Nxg5 f6 19. Nf3 Kf7 20. Rxe8 Rxe8 1/2-1/2',
  fools: '1. f3 e5 2. g4 Qh4# 0-1',
}
describe('reference game from a real Chess.com review (position before 17.Bxa6)', () => {
  it('17.Bxa6 is Brilliant, 17...bxa6 is not best, and the pipeline stays consistent', async () => {
    const fen = '2kr3r/1pp1ppb1/p1n3pp/2Nq1b2/3P1B2/2PB4/PP2QPPP/R3R1K1 w - - 0 17'
    const g = parsePgn(`[SetUp "1"]\n[FEN "${fen}"]\n\n17. Bxa6 bxa6 18. Qxa6+ Kb8 19. Qb7# 1-0`)
    const e = new Engine(T()); await e.init(); const r = await runReview(g, e, 14, () => {}); e.destroy()
    expect(r.moves.find(m => m.san === 'Bxa6')!.cls).toBe('brilliant')
    expect(r.moves.find(m => m.san === 'bxa6')!.cls).not.toBe('best')
    expect(r.moves.find(m => m.san === 'Qb7#')!.cls).not.toBe('book')
    expect(r.counts.w.brilliant).toBe(1)
  }, 120000)
})
describe('validation on real games (depth 12, real Stockfish)', () => {
  for (const [name, pgn] of Object.entries(GAMES)) it(name, async () => {
    const g = parsePgn(pgn), e = new Engine(T()); await e.init(); const r = await runReview(g, e, 12, () => {}); e.destroy()
    expect(r.complete).toBe(true); expect(r.moves.length).toBe(g.moves.length)
    for (const s of ['w', 'b'] as const) { const ms = r.moves.filter(m => m.color === s); expect(Object.values(r.counts[s]).reduce((a, b) => a + (b ?? 0), 0)).toBe(ms.length) }
    // graph point i (position after move i) equals that move's stored eval
    r.moves.forEach(m => expect(r.evals[m.ply]!.lines[0].score).toEqual(m.evalAfter))
    r.moves.forEach(m => expect(r.evals[m.ply - 1]!.lines[0].score).toEqual(m.evalBefore))
    console.log(name, r.moves.map(m => `${m.ply}.${m.san}:${m.cls}${m.sacrifice ? '(sac)' : ''}`).join(' '), '\nacc', r.accuracy, 'rating', JSON.stringify(r.rating), 'phases', JSON.stringify(r.phases.w) )
    if (name === 'opera') expect(r.moves.find(m => m.san === 'Qb8+')!.cls).toBe('brilliant')
    if (name === 'fools') expect(r.moves.find(m => m.san === 'g4')!.cls).toBe('blunder')
  }, 180000)
})
