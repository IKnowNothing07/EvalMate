import type { Review } from './core/review'
/** chrome.storage.local has a ~10 MB quota (no unlimitedStorage permission requested). Falls back to localStorage in dev. */
const hasChromeStore = () => typeof chrome !== 'undefined' && !!chrome.storage?.local
export const QUOTA_BYTES = hasChromeStore() ? 10 * 1024 * 1024 : 5 * 1024 * 1024
export interface SavedReview { id: string; savedAt: number; pgn: string; white: string; black: string; result: string; review: Review }
const KEY = 'evalmate.reviews'
const hasChrome = () => typeof chrome !== 'undefined' && !!chrome.storage?.local
export async function loadAll(): Promise<SavedReview[]> {
  try { if (hasChrome()) return ((await chrome.storage.local.get(KEY))[KEY] as SavedReview[]) ?? []
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') } catch { return [] }
}
async function put(all: SavedReview[]) {
  // Web build: localStorage is small (~5 MB per site) and per device/browser. If it is full, drop the oldest reviews until it fits.
  for (let n = all.length; ; n--) {
    try { if (hasChrome()) await chrome.storage.local.set({ [KEY]: all.slice(0, n) }); else localStorage.setItem(KEY, JSON.stringify(all.slice(0, n))); return }
    catch (e) { if (n <= 1) { console.warn('Could not save review:', e); return } }
  }
}
export async function saveReview(r: SavedReview) { const all = (await loadAll()).filter(x => x.id !== r.id); all.unshift(r); await put(all.slice(0, 200)) }
export async function deleteReview(id: string) { await put((await loadAll()).filter(x => x.id !== id)) }
export async function clearAll() { await put([]) }
export async function usedBytes() { return hasChrome() ? await chrome.storage.local.getBytesInUse(KEY) : (localStorage.getItem(KEY) ?? '').length }
export const gameId = (pgn: string) => { let h = 5381; for (const c of pgn) h = ((h << 5) + h + c.charCodeAt(0)) | 0; return 'g' + (h >>> 0).toString(36) }
