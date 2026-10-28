import { describe, it, expect } from 'vitest'
import { spawn } from 'node:child_process'
import { Engine, AnalysisCancelled, type Transport } from '../src/core/engine'
import { parsePgn } from '../src/core/pgn'
import { runReview } from '../src/core/review'
const nodeTransport = (): Transport => {
  const p = spawn('node', ['public/engine/stockfish-19-lite-single.js']); let cb = (_: string) => {}, buf = ''
  p.stdout.on('data', d => { buf += d; const ls = buf.split('\n'); buf = ls.pop()!; ls.forEach(l => cb(l)) })
  return { post: c => p.stdin.write(c + '\n'), onLine: f => { cb = f }, onError: f => p.on('error', f), terminate: () => p.kill() }
}
describe('real Stockfish', () => {
  it('finds mate in 1 and reports White-perspective scores', async () => {
    const e = new Engine(nodeTransport()); await e.init()
    const r = await e.analyze('6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1', 8) // Ra8#
    expect(r.lines[0].pv[0]).toBe('a1a8'); expect(r.lines[0].score.mate).toBe(1)
    const b = await e.analyze('r3k3/8/8/8/8/8/5PPP/6K1 b - - 0 1', 8) // black mates in 1 with Ra1#
    expect(b.lines[0].score.mate).toBe(-1); expect(b.lines[0].score.cp).toBeLessThan(-9000)
    e.destroy()
  }, 60000)
  it('cancels cleanly and recovers', async () => {
    const e = new Engine(nodeTransport()); await e.init()
    const p = e.analyze('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 30)
    setTimeout(() => e.stop(), 300)
    await expect(p).rejects.toBeInstanceOf(AnalysisCancelled)
    await new Promise(r => setTimeout(r, 500))
    expect((await e.analyze('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1', 6)).lines.length).toBeGreaterThan(0)
    e.destroy()
  }, 60000)
  it('E2E: review a game with a blunder', async () => {
    // 1.f3 e5 2.g4?? Qh4# (Fool's mate): White's g4 must be flagged, checkmate handled w/o engine
    const g = parsePgn('1. f3 e5 2. g4 Qh4#'); const e = new Engine(nodeTransport()); await e.init()
    const rev = await runReview(g, e, 8, () => {})
    expect(rev.complete).toBe(true); const g4 = rev.moves.find(m => m.san === 'g4')!
    expect(g4.cls).toBe('blunder'); expect(g4.bestUci).toBeTruthy(); expect(rev.accuracy.w!).toBeLessThan(rev.accuracy.b!)
    e.destroy()
  }, 120000)
})
