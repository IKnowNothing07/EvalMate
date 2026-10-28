import { Chess } from 'chess.js'
import type { ParsedGame } from './core/pgn'
import type { Review } from './core/review'
import { formatScore } from './core/eval'
const SYM: Record<string, string> = { brilliant: '!!', great: '!', inaccuracy: '?!', mistake: '?', blunder: '??', miss: '?' }
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
/** Analysed PGN: original headers + mainline only, with {eval/classification} comments. Original text is never modified. */
export function annotatedPgn(game: ParsedGame, review: Review) {
  const c = new Chess(game.startFen); const h = Object.entries(game.headers).map(([k, v]) => `[${k} "${v.replace(/"/g, "'")}"]`).join('\n')
  let out = ''
  game.moves.forEach((m, i) => {
    const r = review.moves.find(x => x.ply === i + 1)
    out += (m.color === 'w' ? `${Math.floor(i / 2) + 1}. ` : (i === 0 ? `${1}... ` : '')) + m.san + (r ? (SYM[r.cls] ?? '') : '')
    if (r) out += ` {${r.cls}; eval ${formatScore(r.evalAfter)}${r.cls !== 'best' && r.bestUci ? '; best ' + (() => { try { const d = new Chess(game.fens[i]); return d.move({ from: r.bestUci.slice(0, 2), to: r.bestUci.slice(2, 4), promotion: r.bestUci[4] }).san } catch { return r.bestUci } })() : ''}}`
    out += ' '
  }); void c
  return `${h}\n\n${out.trim()} ${game.result}\n`
}
export const reviewJson = (game: ParsedGame, review: Review) => JSON.stringify({ app: 'ChessIQ', headers: game.headers, depth: review.depth, complete: review.complete, accuracy: review.accuracy, counts: review.counts, opening: review.opening,
  moves: review.moves.map(m => ({ ply: m.ply, san: m.san, cls: m.cls, winLoss: +m.winLoss.toFixed(2), best: m.bestUci, evalAfter: m.evalAfter })) }, null, 2)
export function reviewHtml(game: ParsedGame, review: Review) {
  const f = (n: number | null) => n === null ? 'n/a' : n.toFixed(1)
  const rows = review.moves.map(m => `<tr><td>${Math.ceil(m.ply / 2)}${m.color === 'w' ? '.' : '...'}</td><td>${esc(m.san)}</td><td>${m.cls}</td><td>${esc(formatScore(m.evalAfter))}</td></tr>`).join('')
  return `<!doctype html><meta charset="utf-8"><title>ChessIQ review</title><style>body{font:14px system-ui;max-width:700px;margin:2em auto}td,th{padding:2px 10px;text-align:left}</style>
<h1>${esc(game.headers.White ?? '?')} vs ${esc(game.headers.Black ?? '?')} — ${esc(game.result)}</h1><p>${review.opening ? esc(review.opening.eco + ' ' + review.opening.name) : ''} · depth ${review.depth} · ${review.complete ? 'complete' : 'INCOMPLETE'}</p>
<p>Accuracy (ChessIQ estimate): White ${f(review.accuracy.w)}, Black ${f(review.accuracy.b)}</p><table>${rows}</table>`
}
export function download(name: string, text: string, type = 'text/plain') {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
