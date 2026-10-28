// Builds src/data/openings.json from lichess-org/chess-openings (CC0). Run: npm run build:openings
import { Chess } from 'chess.js'; import { writeFileSync } from 'node:fs'
const out = {}
for (const f of 'abcde') {
  const txt = await (await fetch(`https://raw.githubusercontent.com/lichess-org/chess-openings/master/${f}.tsv`)).text()
  for (const row of txt.trim().split('\n').slice(1)) {
    const [eco, name, pgn] = row.split('\t'); const c = new Chess()
    try { c.loadPgn(pgn) } catch { continue }
    out[c.fen().split(' ').slice(0, 4).join(' ')] = [eco, name]
  }
}
writeFileSync('src/data/openings.json', JSON.stringify(out)); console.log(Object.keys(out).length, 'openings')
