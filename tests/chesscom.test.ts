import { describe, it, expect, afterEach } from 'vitest'
import { monthsToFetch, normalizeGames, fetchRecentGames, validUsername, ChessComError } from '../src/chesscom'
import { loadUsername, saveUsername, forgetUsername } from '../src/storage'
const DAY = 86400, NOW = Date.UTC(2026, 10, 10, 12) // 10 Nov 2026
const game = (daysAgo: number, o: Record<string, unknown> = {}) => ({ pgn: '1. e4 e5 *', url: 'https://chess.com/g/' + daysAgo, end_time: Math.floor(NOW / 1000) - Math.round(daysAgo * DAY), rules: 'chess', time_class: 'rapid',
  white: { username: 'Me', rating: 900, result: 'win' }, black: { username: 'Opp', rating: 950, result: 'resigned' }, ...o })
describe('which archive months cover the last 30 days', () => {
  it('spans two months', () => expect(monthsToFetch(NOW)).toEqual(['2026/10', '2026/11']))
  it('spans a year boundary', () => expect(monthsToFetch(Date.UTC(2027, 0, 10))).toEqual(['2026/12', '2027/01']))
  it('end of month can need only the current and previous month', () => expect(monthsToFetch(Date.UTC(2026, 2, 31))).toEqual(['2026/03']))
  it('a short window inside one month needs one request', () => expect(monthsToFetch(NOW, 5)).toEqual(['2026/11']))
})
describe('normalising games', () => {
  const cutoff = NOW - 30 * DAY * 1000
  it('keeps only games inside the window, newest first', () => {
    const r = normalizeGames([game(40), game(29), game(2), game(10)], 'me', cutoff); expect(r.games.map(g => g.url!.split('/').pop())).toEqual(['2', '10', '29'])
  })
  it('result is from the user\'s side (as White and as Black), draws detected', () => {
    const asBlack = game(1, { white: { username: 'Opp', result: 'checkmated' }, black: { username: 'me', result: 'win' } })
    const draw = game(2, { white: { username: 'me', result: 'agreed' }, black: { username: 'Opp', result: 'agreed' } })
    const loss = game(3, { white: { username: 'me', result: 'timeout' }, black: { username: 'Opp', result: 'win' } })
    const r = normalizeGames([asBlack, draw, loss], 'ME', cutoff).games
    expect(r.map(g => [g.result, g.color, g.reason])).toEqual([['Win', 'b', 'checkmate'], ['Draw', 'w', 'agreement'], ['Loss', 'w', 'timeout']])
  })
  it('skips variants (counted), games without PGN, and malformed entries without crashing', () => {
    const r = normalizeGames([game(1, { rules: 'chess960' }), game(2, { pgn: undefined }), { nonsense: true }, null as any, game(3)], 'me', cutoff); expect(r.games.length).toBe(1); expect(r.skipped).toBe(1)
  })
  it('username validation', () => { expect(validUsername('harsh12chess')).toBe(true); expect(validUsername('a')).toBe(false); expect(validUsername('bad name!')).toBe(false) })
})
describe('fetchRecentGames (mocked Chess.com API; not a live test)', () => {
  const mock = (map: Record<string, unknown>, calls: string[] = []) => async (url: string) => { calls.push(url); const v = map[url]; return v === undefined ? { ok: false, status: 404, json: async () => ({}) } : { ok: true, status: 200, json: async () => v } }
  const base = 'https://api.chess.com/pub/player/me'
  it('fetches every overlapping month (not just the latest) and merges them', async () => {
    const calls: string[] = [], f = mock({ [`${base}/games/archives`]: { archives: [`${base}/games/2026/08`, `${base}/games/2026/09`, `${base}/games/2026/10`, `${base}/games/2026/11`] },
      [`${base}/games/2026/10`]: { games: [game(25), game(35)] }, [`${base}/games/2026/11`]: { games: [game(1), game(9)] } }, calls)
    const r = await fetchRecentGames('Me', { now: NOW, fetch: f }); expect(r.games.length).toBe(3); expect(r.months).toBe(2)
    expect(calls).toEqual([`${base}/games/archives`, `${base}/games/2026/10`, `${base}/games/2026/11`]) // older months are never requested
  })
  it('a user with no games in the window gets an empty list, not an error', async () => {
    const r = await fetchRecentGames('me', { now: NOW, fetch: mock({ [`${base}/games/archives`]: { archives: [`${base}/games/2025/01`] } }) }); expect(r.games).toEqual([]); expect(r.months).toBe(0)
  })
  it('clear errors: unknown user, no archives, network failure, rate limit, bad name', async () => {
    await expect(fetchRecentGames('me', { now: NOW, fetch: mock({}) })).rejects.toThrow('User not found')
    await expect(fetchRecentGames('me', { now: NOW, fetch: mock({ [`${base}/games/archives`]: { archives: [] } }) })).rejects.toThrow('No games found')
    await expect(fetchRecentGames('me', { now: NOW, fetch: async () => { throw new TypeError('Failed to fetch') } })).rejects.toThrow('Could not reach Chess.com')
    await expect(fetchRecentGames('me', { now: NOW, fetch: async () => ({ ok: false, status: 429, json: async () => ({}) }) })).rejects.toThrow('rate-limiting')
    await expect(fetchRecentGames('x', { now: NOW })).rejects.toBeInstanceOf(ChessComError)
  })
})
describe('remembered username', () => {
  const store = new Map<string, string>(); const g = globalThis as any
  g.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) }
  afterEach(() => store.clear())
  it('saves, loads and forgets', async () => { expect(await loadUsername()).toBe(''); await saveUsername('harsh12chess'); expect(await loadUsername()).toBe('harsh12chess'); await forgetUsername(); expect(await loadUsername()).toBe('') })
  it('ignores a corrupted stored value', async () => { store.set('evalmate.chesscom.username', '<script>'); expect(await loadUsername()).toBe('') })
})
