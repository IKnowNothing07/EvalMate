import { parseInfo } from './eval'
import type { EngineLine, PositionEval } from './types'
/** Transport abstraction so the same Engine runs on a Web Worker (browser) or a child process (tests). */
export interface Transport { post(cmd: string): void; onLine(cb: (l: string) => void): void; onError(cb: (e: Error) => void): void; terminate(): void }
export class AnalysisCancelled extends Error {}
export class Engine {
  private cur: { turn: 'w'|'b'; lines: Map<number, EngineLine>; resolve: (l: EngineLine[]) => void; reject: (e: Error) => void } | null = null
  private waiters: [string, () => void][] = []
  private cache = new Map<string, PositionEval>()
  constructor(private t: Transport) {
    t.onLine(l => this.handle(l.trim()))
    t.onError(e => { this.cur?.reject(e); this.cur = null })
  }
  private handle(l: string) {
    this.waiters = this.waiters.filter(([m, f]) => (l === m ? (f(), false) : true))
    if (!this.cur) return
    if (l.startsWith('bestmove')) { const c = this.cur; this.cur = null; c.resolve([...c.lines.values()].sort((a, b) => a.multipv - b.multipv)); return }
    const info = parseInfo(l, this.cur.turn); if (info) this.cur.lines.set(info.multipv, info)
  }
  private wait(msg: string, ms = 15000) { return new Promise<void>((res, rej) => { const to = setTimeout(() => rej(new Error('Engine timeout waiting for ' + msg)), ms); this.waiters.push([msg, () => { clearTimeout(to); res() }]) }) }
  async init(multipv = 2) {
    const u = this.wait('uciok'); this.t.post('uci'); await u
    this.t.post(`setoption name MultiPV value ${multipv}`)
    const r = this.wait('readyok'); this.t.post('isready'); await r
  }
  /** Analyse one FEN to a fixed depth. Cached by fen+depth. Rejects on cancel/timeout/error. */
  async analyze(fen: string, depth: number, timeoutMs = 60000): Promise<PositionEval> {
    const key = fen + '|' + depth, hit = this.cache.get(key); if (hit) return hit
    if (this.cur) throw new Error('Engine busy')
    const turn = fen.split(' ')[1] as 'w'|'b'
    const lines = await new Promise<EngineLine[]>((resolve, reject) => {
      const to = setTimeout(() => { this.stop(); reject(new Error('Analysis timeout')) }, timeoutMs)
      this.cur = { turn, lines: new Map(), resolve: l => { clearTimeout(to); resolve(l) }, reject: e => { clearTimeout(to); reject(e) } }
      this.t.post('position fen ' + fen); this.t.post('go depth ' + depth)
    })
    if (!lines.length) throw new Error('Engine returned no analysis for ' + fen)
    const r = { fen, lines, depth: lines[0].depth }; this.cache.set(key, r); return r
  }
  stop() { if (this.cur) { this.t.post('stop'); const c = this.cur; this.cur = null; c.reject(new AnalysisCancelled('cancelled')) } }
  destroy() { this.stop(); this.t.terminate() }
}
export function workerTransport(url: string): Transport {
  const w = new Worker(url); let lcb = (_: string) => {}, ecb = (_: Error) => {}
  w.onmessage = e => lcb(String(e.data)); w.onerror = e => ecb(new Error(e.message || 'Worker error'))
  return { post: c => w.postMessage(c), onLine: cb => { lcb = cb }, onError: cb => { ecb = cb }, terminate: () => w.terminate() }
}
