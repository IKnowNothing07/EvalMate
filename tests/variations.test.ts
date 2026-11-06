import { describe, it, expect } from 'vitest'
import { Chess } from 'chess.js'
import { parsePgn } from '../src/core/pgn'
import { emptyVars, addMove, stepBack, stepForward, plyOf, labelOf, removeSubtree, count, anchorOf, locFen, type VarState, type Loc } from '../src/core/variations'
const deepFreeze = <T,>(o: T): T => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o as object).forEach(deepFreeze) } return o }
const game = deepFreeze(parsePgn('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6'))
const main = (ply: number): Loc => ({ kind: 'main', ply })
describe('variation tree never mutates the original game', () => {
  it('branching from the main line creates a node and leaves the game untouched (frozen => any write would throw)', () => {
    const s0 = deepFreeze(emptyVars()), r = addMove(s0, game, main(4), 'd2', 'd4')!   // 3.d4 instead of 3.Bb5 (ply 4 = after 2...Nc6)
    expect(r.followedGame).toBe(false); expect(r.loc.kind).toBe('var'); const n = r.state.nodes[(r.loc as { id: string }).id]
    expect(n.san).toBe('d4'); expect(n.anchor).toBe(4); expect(n.parent).toBeNull(); expect(n.fen).toContain(' b ')
    expect(s0).toEqual(emptyVars()); expect(game.moves.length).toBe(14); expect(game.fens.length).toBe(15)
  })
  it("playing the game's own next move just advances the main line (no duplicate variation)", () => {
    const s0 = emptyVars(), r = addMove(s0, game, main(4), 'f1', 'b5')!; expect(r.followedGame).toBe(true); expect(r.loc).toEqual(main(5)); expect(r.state).toBe(s0)
  })
  it('rejects illegal moves', () => { expect(addMove(emptyVars(), game, main(0), 'e2', 'e5')).toBeNull(); expect(addMove(emptyVars(), game, main(0), 'e7', 'e5')).toBeNull() })
  it('re-playing the same alternative reuses the node; different alternatives become siblings', () => {
    let s: VarState = emptyVars(); const a = addMove(s, game, main(4), 'd2', 'd4')!; s = a.state
    const again = addMove(s, game, main(4), 'd2', 'd4')!; expect(again.loc).toEqual(a.loc); expect(count(again.state)).toBe(1)
    const other = addMove(s, game, main(4), 'c2', 'c3')!; expect(count(other.state)).toBe(2); expect(other.state.roots[4].length).toBe(2)
  })
  it('recursion: lines can go arbitrarily deep, with correct labels, plies and FENs', () => {
    let s: VarState = emptyVars(), loc: Loc = main(4)
    for (const [f, t] of [['d2', 'd4'], ['e5', 'd4'], ['f3', 'd4'], ['f8', 'b4']] as const) { const r = addMove(s, game, loc, f, t)!; s = r.state; loc = r.loc }
    const id = (loc as { id: string }).id; expect(plyOf(s, id)).toBe(8); expect(labelOf(s, id)).toBe('4... Bb4+'); expect(anchorOf(s, loc)).toBe(4)
    expect(new Chess(locFen(s, game, loc)).get('b4')).toEqual({ type: 'b', color: 'b' }) // black bishop really is on b4
  })
  it('navigation: back walks the variation then returns to the anchor; forward follows the first child', () => {
    let s: VarState = emptyVars(), loc: Loc = main(2); const ids: string[] = []
    for (const [f, t] of [['d2', 'd4'], ['d7', 'd5']] as const) { const r = addMove(s, game, loc, f, t)!; s = r.state; loc = r.loc; ids.push((loc as { id: string }).id) }
    expect(stepBack(s, loc)).toEqual({ kind: 'var', id: ids[0] }); expect(stepBack(s, stepBack(s, loc))).toEqual(main(2))
    expect(stepForward(s, game, { kind: 'var', id: ids[0] })).toEqual({ kind: 'var', id: ids[1] }); expect(stepForward(s, game, loc)).toEqual(loc)
    expect(stepBack(s, main(0))).toEqual(main(0)); expect(stepForward(s, game, main(14))).toEqual(main(14))
  })
  it('promotion choice is respected', () => {
    const g = deepFreeze(parsePgn('[SetUp "1"]\n[FEN "8/P6k/8/8/8/8/8/K7 w - - 0 1"]\n\n1. a8=Q'))
    expect(addMove(emptyVars(), g, main(0), 'a7', 'a8', 'q')!.followedGame).toBe(true)
    const n = addMove(emptyVars(), g, main(0), 'a7', 'a8', 'n')!; expect(n.state.nodes[(n.loc as { id: string }).id].san).toBe('a8=N')
  })
  it('removing a branch deletes its subtree and returns to its parent', () => {
    let s: VarState = emptyVars(), loc: Loc = main(4); const r1 = addMove(s, game, loc, 'd2', 'd4')!; s = r1.state; const r2 = addMove(s, game, r1.loc, 'e5', 'd4')!; s = r2.state
    const out = removeSubtree(deepFreeze(s), (r1.loc as { id: string }).id); expect(count(out.state)).toBe(0); expect(out.loc).toEqual(main(4)); expect(out.state.roots[4]).toBeUndefined()
    const out2 = removeSubtree(s, (r2.loc as { id: string }).id); expect(count(out2.state)).toBe(1); expect(out2.loc).toEqual(r1.loc)
  })
})
