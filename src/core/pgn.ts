import { Chess } from 'chess.js'
export interface ParsedGame { headers: Record<string,string>; startFen: string; moves: { san: string; uci: string; fen: string; color: 'w'|'b' }[]; fens: string[]; result: string }
export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
export class PgnError extends Error {}
export function parsePgn(text: string): ParsedGame {
  if (!text || !text.trim()) throw new PgnError('PGN is empty')
  if (text.length > 2_000_000) throw new PgnError('PGN too large')
  const first = text.split(/\n\s*\n(?=\[Event )/)[0] // first game only
  const variant = first.match(/\[Variant "([^"]+)"\]/i)?.[1]
  if (variant && !/^standard$/i.test(variant)) throw new PgnError(`Unsupported variant: ${variant}. Only standard chess is supported.`)
  const c = new Chess()
  try { c.loadPgn(first) } catch (e) { throw new PgnError('Invalid or illegal PGN: ' + (e as Error).message) }
  const headers = c.getHeaders() as Record<string,string>
  const startFen = headers.FEN && headers.SetUp === '1' ? headers.FEN : START_FEN
  const hist = c.history({ verbose: true })
  if (!hist.length) throw new PgnError('PGN contains no moves')
  return { headers, startFen, result: headers.Result ?? '*', fens: [startFen, ...hist.map(h => h.after)],
    moves: hist.map(h => ({ san: h.san, uci: h.from + h.to + (h.promotion ?? ''), fen: h.after, color: h.color })) }
}
