import db from '../data/openings.json'
const book = db as unknown as Record<string, [string, string]>
const key = (fen: string) => fen.split(' ').slice(0, 4).join(' ')
export const lookupOpening = (fen: string) => { const o = book[key(fen)]; return o ? { eco: o[0], name: o[1] } : null }
