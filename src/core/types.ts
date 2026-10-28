/** Score from WHITE's perspective. cp is always numeric (mate scores are mapped to ±(10000-|mate|)). */
export interface Score { cp: number; mate?: number } // mate: signed moves-to-mate (+ = White mates), 0 = checkmate on board
export interface EngineLine { multipv: number; score: Score; pv: string[]; depth: number; nodes?: number; nps?: number }
export interface PositionEval { fen: string; lines: EngineLine[]; depth: number }
export type Classification = 'brilliant'|'great'|'best'|'excellent'|'good'|'book'|'inaccuracy'|'mistake'|'miss'|'blunder'
