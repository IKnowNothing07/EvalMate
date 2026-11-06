import { describe, it, expect } from 'vitest'
import { Chess } from 'chess.js'
import { AnalysisService, fenKey } from '../src/core/analysis'
import { Engine } from '../src/core/engine'
import { nodeTransport } from '../scripts/lib/node-engine'
import { parsePgn } from '../src/core/pgn'
import type { PositionEval } from '../src/core/types'
const deepFreeze = <T,>(o: T): T => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o as object).forEach(deepFreeze) } return o }
const mk = async () => { const e = new Engine(nodeTransport()); await e.init(2); return e }
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const A = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3', B = 'rnbqkb1r/pppppppp/5n2/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 1 2'
const legal = (fen: string, uci: string) => new Chess(fen).moves({ verbose: true }).some(m => m.from + m.to + (m.promotion ?? '') === uci)
describe('AnalysisService (real Stockfish)', () => {
  it('serves seeded (main-line) positions from cache without touching the engine', async () => {
    let made = 0; const seeded: PositionEval = deepFreeze({ fen: A, depth: 10, lines: [{ multipv: 1, score: { cp: 30 }, pv: ['d2d4'], depth: 10 }] })
    const s = new AnalysisService(() => { made++; return mk() }, [seeded], 10)
    expect(await s.request(A)).toBe(seeded); expect(s.get(A.replace(' 2 3', ' 9 9'))).toBe(seeded) // same position, other move counters
    expect(made).toBe(0); expect(s.engineRuns).toBe(0); s.dispose()
  })
  it('checkmate and stalemate need no engine', async () => {
    let made = 0; const s = new AnalysisService(() => { made++; return mk() }, [], 10)
    const mate = parsePgn('1. f3 e5 2. g4 Qh4#').fens.at(-1)!; const r = await s.request(mate); expect(r!.lines[0].score.mate).toBe(0); expect(made).toBe(0); s.dispose()
  })
  it('analyses a new position once, then caches it', async () => {
    const s = new AnalysisService(mk, [], 10); const ev = (await s.request(B))!
    expect(ev.fen).toBe(B); expect(ev.lines.length).toBeGreaterThan(0); expect(legal(B, ev.lines[0].pv[0])).toBe(true); expect(s.engineRuns).toBe(1)
    expect(await s.request(B)).toBe(ev); expect(s.engineRuns).toBe(1); s.dispose()
  }, 60000)
  it('latest request wins: a superseded search resolves null and the new result is complete (no stale bestmove)', async () => {
    const s = new AnalysisService(mk, [], 14); const pa = s.request(A); await new Promise(r => setTimeout(r, 150)); const pb = s.request(B)
    expect(await pa).toBeNull(); const eb = (await pb)!; expect(eb.fen).toBe(B); expect(eb.lines[0].depth).toBeGreaterThanOrEqual(13); expect(legal(B, eb.lines[0].pv[0])).toBe(true); s.dispose()
  }, 90000)
  it('survives rapid-fire navigation: only the last position resolves, engine stays usable', async () => {
    const s = new AnalysisService(mk, [], 12); const fens = [A, B, 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2']
    const ps = fens.map((f, i) => { const p = s.request(f); return new Promise<void>(r => setTimeout(r, 20 * (i + 1))).then(() => p) }) // staggered but overlapping
    const res = await Promise.all(ps); expect(res.slice(0, -1).every(r => r === null)).toBe(true); expect(res.at(-1)!.fen).toBe(fens.at(-1))
    const again = (await s.request(START))!; expect(again.lines[0].depth).toBeGreaterThanOrEqual(11); s.dispose()
  }, 120000)
  it('recovers from an engine failure by restarting on the next request', async () => {
    let calls = 0; const s = new AnalysisService(() => { if (calls++ === 0) throw new Error('worker failed to start'); return mk() }, [], 10)
    expect(await s.request(A)).toBeNull(); expect(s.error).toMatch(/failed/); const ok = await s.request(A); expect(ok!.fen).toBe(A); expect(s.error).toBeNull(); s.dispose()
  }, 60000)
  it('dispose resolves pending requests with null and stops the engine', async () => {
    const s = new AnalysisService(mk, [], 18); const p = s.request(A); await new Promise(r => setTimeout(r, 200)); s.dispose(); expect(await p).toBeNull()
  }, 30000)
  it('never mutates the seeded review evals', async () => {
    const seed = [deepFreeze({ fen: START, depth: 10, lines: [{ multipv: 1, score: { cp: 20 }, pv: ['e2e4'], depth: 10 }] })] as PositionEval[]
    const s = new AnalysisService(mk, seed, 10); await s.request(B); expect(s.get(START)).toBe(seed[0]); expect(fenKey(B)).toBe(B.split(' ').slice(0, 4).join(' ')); s.dispose()
  }, 60000)
})
