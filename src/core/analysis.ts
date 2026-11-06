import { AnalysisCancelled, type Engine } from './engine'
import { terminalEval } from './review'
import type { PositionEval } from './types'
/** Cache key: placement, side to move, castling, en passant (move counters ignored so transpositions share results). */
export const fenKey = (fen: string) => fen.split(' ').slice(0, 4).join(' ')
/**
 * On-demand analysis of arbitrary positions (variations) with ONE engine, a cache, and "latest request wins":
 * asking for a new position cancels the search in progress (resolving its promise with null). Main-line evals from the
 * finished review are seeded into the cache, so those positions are never re-analysed. The review itself is never modified.
 */
export class AnalysisService {
  private engine: Engine | null = null
  private cache = new Map<string, PositionEval>()
  private waiters = new Map<string, ((e: PositionEval | null) => void)[]>()
  private latest: string | null = null
  private current: string | null = null
  private running = false
  private disposed = false
  error: string | null = null
  engineRuns = 0 // how many positions the engine actually searched (for tests/diagnostics)
  constructor(private makeEngine: () => Promise<Engine> | Engine, seed: (PositionEval | null)[], readonly depth: number) { seed.forEach(e => { if (e) this.cache.set(fenKey(e.fen), e) }) }
  /** Cached or trivially known (checkmate/draw) evaluation, else undefined. */
  get(fen: string): PositionEval | undefined { return this.cache.get(fenKey(fen)) ?? this.terminal(fen) }
  private terminal(fen: string) { const t = terminalEval(fen); if (t) this.cache.set(fenKey(fen), t); return t ?? undefined }
  request(fen: string): Promise<PositionEval | null> {
    const hit = this.get(fen); if (hit) return Promise.resolve(hit)
    if (this.disposed) return Promise.resolve(null)
    const key = fenKey(fen)
    return new Promise(resolve => {
      for (const [k, rs] of this.waiters) if (k !== key) { rs.forEach(r => r(null)); this.waiters.delete(k) } // superseded
      this.waiters.set(key, [...(this.waiters.get(key) ?? []), resolve]); this.latest = fen
      if (this.running) { if (this.current !== key) this.engine?.stop() } else void this.loop()
    })
  }
  private settle(key: string, ev: PositionEval | null) { (this.waiters.get(key) ?? []).forEach(r => r(ev)); this.waiters.delete(key) }
  private async loop() {
    this.running = true
    try {
      while (this.latest && !this.disposed) {
        const fen = this.latest, key = fenKey(fen); this.current = key
        const hit = this.get(fen); if (hit) { this.settle(key, hit); if (this.latest === fen) this.latest = null; continue }
        try {
          this.engine ??= await this.makeEngine()
          if (this.latest !== fen) continue // superseded while the engine was starting
          const ev = await this.engine.analyze(fen, this.depth, 120000); this.engineRuns++
          this.cache.set(key, ev); this.error = null; this.settle(key, ev); if (this.latest === fen) this.latest = null
        } catch (e) {
          if (e instanceof AnalysisCancelled) { if (this.latest === fen) this.latest = null; this.settle(key, null); continue }
          this.error = (e as Error).message || 'Engine error'; this.engine?.destroy(); this.engine = null // restart on the next request
          this.settle(key, null); if (this.latest === fen) this.latest = null
        }
      }
    } finally { this.running = false; this.current = null }
  }
  dispose() { this.disposed = true; this.latest = null; for (const k of [...this.waiters.keys()]) this.settle(k, null); this.engine?.destroy(); this.engine = null }
}
