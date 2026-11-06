import { Chess } from 'chess.js'
import type { ParsedGame } from './pgn'
/**
 * Variation tree for exploring alternatives WITHOUT touching the original game. Pure functions on plain, immutable data:
 * every operation returns new objects and never mutates its inputs (the tests freeze the game and the state to prove it).
 * A variation branches from a position of the main line (its "anchor" = ply index) or from another variation node.
 */
export interface VNode { id: string; anchor: number; parent: string | null; fen: string; san: string; uci: string; children: string[] }
export interface VarState { nodes: Record<string, VNode>; roots: Record<number, string[]>; seq: number }
export type Loc = { kind: 'main'; ply: number } | { kind: 'var'; id: string }
export const emptyVars = (): VarState => ({ nodes: {}, roots: {}, seq: 0 })
export const locFen = (s: VarState, game: ParsedGame, l: Loc) => (l.kind === 'main' ? game.fens[l.ply] : s.nodes[l.id].fen)
export const anchorOf = (s: VarState, l: Loc) => (l.kind === 'main' ? l.ply : s.nodes[l.id].anchor)
export const count = (s: VarState) => Object.keys(s.nodes).length
const norm = (m: { from: string; to: string; promotion?: string }) => m.from + m.to + (m.promotion ?? '')
/** Play a move from `loc`. Returns null for an illegal move. Following the game's own next move stays on the main line. */
export function addMove(s: VarState, game: ParsedGame, loc: Loc, from: string, to: string, promotion?: string): { state: VarState; loc: Loc; followedGame: boolean } | null {
  const c = new Chess(locFen(s, game, loc)); let m
  try { m = c.move({ from, to, promotion }) } catch { return null }
  const uci = norm(m)
  if (loc.kind === 'main' && game.moves[loc.ply]?.uci === uci) return { state: s, loc: { kind: 'main', ply: loc.ply + 1 }, followedGame: true }
  const siblings = loc.kind === 'main' ? s.roots[loc.ply] ?? [] : s.nodes[loc.id].children
  const same = siblings.find(id => s.nodes[id].uci === uci)
  if (same) return { state: s, loc: { kind: 'var', id: same }, followedGame: false }
  const id = `v${s.seq + 1}`, parent = loc.kind === 'var' ? loc.id : null, anchor = loc.kind === 'main' ? loc.ply : s.nodes[loc.id].anchor
  const node: VNode = { id, anchor, parent, fen: c.fen(), san: m.san, uci, children: [] }
  const nodes = { ...s.nodes, [id]: node }
  if (parent) nodes[parent] = { ...s.nodes[parent], children: [...s.nodes[parent].children, id] }
  const roots = parent ? s.roots : { ...s.roots, [anchor]: [...(s.roots[anchor] ?? []), id] }
  return { state: { nodes, roots, seq: s.seq + 1 }, loc: { kind: 'var', id }, followedGame: false }
}
export function stepBack(s: VarState, l: Loc): Loc {
  if (l.kind === 'main') return { kind: 'main', ply: Math.max(0, l.ply - 1) }
  const n = s.nodes[l.id]; return n.parent ? { kind: 'var', id: n.parent } : { kind: 'main', ply: n.anchor }
}
export function stepForward(s: VarState, game: ParsedGame, l: Loc): Loc {
  if (l.kind === 'main') return { kind: 'main', ply: Math.min(game.fens.length - 1, l.ply + 1) }
  const c = s.nodes[l.id].children[0]; return c ? { kind: 'var', id: c } : l
}
/** Absolute ply (counted like the main line) of a variation node. */
export function plyOf(s: VarState, id: string): number { let d = 1, n = s.nodes[id]; while (n.parent) { d++; n = s.nodes[n.parent] } return n.anchor + d }
export const labelOf = (s: VarState, id: string) => { const p = plyOf(s, id); return `${Math.ceil(p / 2)}${p % 2 ? '.' : '...'} ${s.nodes[id].san}` }
export function removeSubtree(s: VarState, id: string): { state: VarState; loc: Loc } {
  const drop = new Set<string>(), walk = (i: string) => { drop.add(i); s.nodes[i].children.forEach(walk) }; walk(id)
  const n = s.nodes[id], nodes: Record<string, VNode> = {}
  for (const k of Object.keys(s.nodes)) if (!drop.has(k)) nodes[k] = s.nodes[k]
  if (n.parent) nodes[n.parent] = { ...nodes[n.parent], children: nodes[n.parent].children.filter(c => c !== id) }
  const roots = { ...s.roots }; if (!n.parent) { roots[n.anchor] = (roots[n.anchor] ?? []).filter(c => c !== id); if (!roots[n.anchor].length) delete roots[n.anchor] }
  return { state: { nodes, roots, seq: s.seq }, loc: n.parent ? { kind: 'var', id: n.parent } : { kind: 'main', ply: n.anchor } }
}
