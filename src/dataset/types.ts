import type { Classification, PositionEval } from '../core/types'
/** How a label was obtained. Never mix these when measuring accuracy. */
export const PROVENANCE = ['chesscom-verified', 'engine-derived', 'puzzle-theme-derived', 'manually-reviewed', 'database-derived'] as const
export type Provenance = typeof PROVENANCE[number]
export const CLASSES: Classification[] = ['brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'miss', 'blunder']
export const LOSS_CLASSES: Classification[] = ['best', 'excellent', 'good', 'inaccuracy', 'mistake', 'blunder']
export const MIN_SUPPORT = 30 // fewer labelled examples than this => a class is "insufficient evidence", never "reliable"
export interface GameSource { id: string; title: string; pgn: string; license: string; origin: string; tags: string[]; note?: string }
/** A single human/engine-provided label for one move of one game. Stored apart from our classifier's predictions. */
export interface LabelRecord { id: string; gameId?: string; ply?: number; san?: string; label: Classification; provenance: Provenance; source: string
  testable: boolean; missing?: string; note?: string; tags?: string[] }
/** Aggregate Chess.com summary numbers for a whole game (verified), usable once the game's PGN is supplied. */
export interface Aggregate { id: string; provenance: 'chesscom-verified'; source: string; gameId?: string; white: string; black: string; testable: boolean
  accuracy: { w: number; b: number }; counts: Record<'w' | 'b', Partial<Record<Classification, number>>>; gameRating?: { w: number; b: number }; note?: string }
export interface StoredAnalysis { engine: string; testDepth: number; refDepth: number; generatedAt: string; games: Record<string, { testEvals: PositionEval[]; refEvals: PositionEval[] }> }
export interface PuzzleRecord { id: string; provenance: 'puzzle-theme-derived'; source: string; license: 'CC0'; fenBeforeOpponentMove: string; moves: string[]; themes: string[]; rating?: number }
