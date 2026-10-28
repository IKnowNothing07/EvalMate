import type { ParsedGame } from '../core/pgn'
import type { Review } from '../core/review'
/** Export the CURRENT review as a dataset-ready record: our predictions are stored as "predictions" (never as labels),
 *  with an empty `labels` array that a human can fill with Chess.com-verified labels. */
export function toDatasetRecord(game: ParsedGame, pgn: string, review: Review) {
  return { schema: 'chessiq-dataset-record/1', game: { id: `export-${Date.now().toString(36)}`, pgn, headers: game.headers, license: 'USER-SUPPLIED (check before sharing)' },
    engine: { name: 'stockfish-19-lite-single', depth: review.depth }, complete: review.complete,
    predictions: review.moves.map(m => ({ ply: m.ply, san: m.san, uci: m.uci, color: m.color, predicted: m.cls, bestUci: m.bestUci ?? null, winLoss: +m.winLoss.toFixed(2), evalBefore: m.evalBefore, evalAfter: m.evalAfter, phase: m.phase, sacrifice: m.sacrifice, labels: [] as unknown[] })),
    labelsHelp: 'Add a label object with value, provenance (chesscom-verified only if you read it in a Chess.com Game Review) and source to a move.' }
}
