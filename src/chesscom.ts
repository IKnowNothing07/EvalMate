/**
 * Recent games from Chess.com's public API (https://www.chess.com/news/view/published-data-api).
 * Chess.com publishes games in monthly archives, so "the last 30 days" usually spans two months: we pick every archive month that
 * overlaps [now - days, now] and then filter by each game's own end_time. No login, no private endpoints.
 */
export const RECENT_DAYS = 30
/** Suggested username shown to first-time visitors (public account; never saved as the user's remembered name). */
export const EXAMPLE_USERNAME = 'MagnusCarlsen'
export interface RecentGame { pgn: string; url?: string; endTime: number; date: string; result: 'Win' | 'Loss' | 'Draw'; color: 'w' | 'b'; opponent: string; oppRating?: number; timeClass: string; reason: string }
export class ChessComError extends Error { constructor(msg: string, readonly status?: number) { super(msg) } }
export const normalizeUsername = (u: string) => u.trim().toLowerCase()
export const validUsername = (u: string) => /^[a-z0-9_-]{2,25}$/.test(u)
const DRAWS = new Set(['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient'])
const REASON: Record<string, string> = { checkmated: 'checkmate', resigned: 'resignation', timeout: 'timeout', abandoned: 'abandonment', agreed: 'agreement', repetition: 'repetition',
  stalemate: 'stalemate', insufficient: 'insufficient material', '50move': '50-move rule', timevsinsufficient: 'timeout vs insufficient material', win: '', lose: '' }
/** Archive months ("YYYY/MM", UTC) that overlap the window, oldest first. */
export function monthsToFetch(nowMs: number, days = RECENT_DAYS): string[] {
  const from = new Date(nowMs - days * 86400000), to = new Date(nowMs), out: string[] = []
  let y = from.getUTCFullYear(), m = from.getUTCMonth()
  while (y < to.getUTCFullYear() || (y === to.getUTCFullYear() && m <= to.getUTCMonth())) { out.push(`${y}/${String(m + 1).padStart(2, '0')}`); if (++m > 11) { m = 0; y++ } }
  return out
}
type Fetch = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<any> }>
async function getJson(url: string, f: Fetch) {
  let r; try { r = await f(url) } catch { throw new ChessComError('Could not reach Chess.com (network or browser block)') }
  if (!r.ok) throw new ChessComError(r.status === 404 ? 'User not found' : r.status === 429 ? 'Chess.com is rate-limiting requests; try again in a minute' : `Chess.com API error ${r.status}`, r.status)
  return r.json()
}
export function normalizeGames(raw: any[], username: string, cutoffMs: number): { games: RecentGame[]; skipped: number } {
  const u = normalizeUsername(username), games: RecentGame[] = []; let skipped = 0
  for (const g of raw ?? []) {
    if (!g?.pgn || typeof g.end_time !== 'number' || g.end_time * 1000 < cutoffMs) continue
    if (g.rules !== 'chess') { skipped++; continue }                       // variants (chess960, bughouse...) are not supported
    const white = String(g.white?.username ?? '').toLowerCase() === u, me = white ? g.white : g.black, opp = white ? g.black : g.white
    const result = me?.result === 'win' ? 'Win' : DRAWS.has(me?.result) ? 'Draw' : 'Loss'
    games.push({ pgn: g.pgn, url: g.url, endTime: g.end_time, date: new Date(g.end_time * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), result,
      color: white ? 'w' : 'b', opponent: opp?.username ?? '?', oppRating: opp?.rating, timeClass: g.time_class ?? '', reason: REASON[result === 'Win' ? opp?.result : me?.result] ?? '' })
  }
  return { games: games.sort((a, b) => b.endTime - a.endTime), skipped }
}
export async function fetchRecentGames(username: string, opts: { now?: number; days?: number; fetch?: Fetch } = {}): Promise<{ games: RecentGame[]; skipped: number; months: number }> {
  const u = normalizeUsername(username); if (!validUsername(u)) throw new ChessComError('Enter a valid Chess.com username')
  const f = opts.fetch ?? ((url: string) => fetch(url)), now = opts.now ?? Date.now(), days = opts.days ?? RECENT_DAYS, cutoff = now - days * 86400000
  const archives: string[] = (await getJson(`https://api.chess.com/pub/player/${encodeURIComponent(u)}/games/archives`, f)).archives ?? []
  if (!archives.length) throw new ChessComError('No games found for this user')
  const want = new Set(monthsToFetch(now, days)), urls = archives.filter(a => want.has(a.split('/').slice(-2).join('/')))
  const all: any[] = []
  for (const url of urls) all.push(...((await getJson(url, f)).games ?? []))   // sequential: polite to the API
  return { ...normalizeGames(all, u, cutoff), months: urls.length }
}
