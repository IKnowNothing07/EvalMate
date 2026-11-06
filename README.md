# ♞ EvalMate

**Free chess game review that runs entirely in your browser.** Paste a PGN or pull a game from Chess.com, and EvalMate analyses every move with Stockfish 19 (WebAssembly), labels each one from *Brilliant* to *Blunder*, graphs the evaluation, and explains what went wrong.

No server. No account. No API keys. No telemetry. Your games never leave your device.

**Live site:** https://iknownothing07.github.io/EvalMate/

---

## Features

- **Import** a PGN by pasting or uploading a `.pgn`, or fetch recent games by Chess.com username (latest month, public archive).
- **Real engine analysis**: Stockfish 19 (lite, single-threaded) in a Web Worker, MultiPV 2, with three strengths: Quick (depth 10), Standard (14), Deep (18). Cancel any time.
- **Move classification**: Book, Brilliant, Great, Best, Excellent, Good, Miss, Inaccuracy, Mistake, Blunder.
- **Accuracy** for both sides, per-phase accuracy (opening / middlegame / endgame), and an estimated game rating.
- **Evaluation graph** drawn with a monotone cubic curve, so it passes through every data point without inventing peaks.
- **Interactive board**: click or drag pieces, promotion, flip, check highlighting, best-move arrows, keyboard navigation (←/→, Home/End) and autoplay.
- **Error navigation**: filter the move list to blunders, mistakes, inaccuracies or misses, and jump between errors.
- **Variation tree**: try alternative lines from any position. Variations branch, can be deleted, and get on-demand engine analysis. The original game and its graph are never modified.
- **Plain-language explanations** for mistakes (missed captures, checks, mate, and so on), generated deterministically with no LLM.
- **Opening names** from the Lichess opening database.
- **History**: finished reviews are saved locally and re-classified from stored evals when opened, so rule changes never leave stale labels.
- **Export**: original PGN, analysed PGN (with `{class; eval; best}` comments), JSON report, HTML report, and a dataset record (JSON).

## Quick start

### Use it online
Open the live site, paste a PGN (or enter a Chess.com username), pick a depth, and press **Review Game**.

### Run it locally
Requires Node.js 20+.

```bash
git clone https://github.com/IKnowNothing07/EvalMate.git
cd EvalMate
npm install
npm test             # unit tests + real-Stockfish tests
npm run build:web    # builds the static site into docs/
npm run preview:web  # serves the built site locally
```

On Windows you can install Node with `winget install OpenJS.NodeJS.LTS` (reopen PowerShell afterwards).

### Deploy to GitHub Pages
1. Run `npm run build:web` and commit the `docs/` folder.
2. In the repo, go to **Settings → Pages → Source: Deploy from a branch**, then choose branch `main` and folder `/docs`.
3. The site appears at `https://<user>.github.io/<repo>/`.

Re-run `npm run build:web` and commit `docs/` after every code change.

## Scripts

| Command | What it does |
| --- | --- |
| `npm test` | Run the Vitest suite |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build:web` | Type-check, then build the site to `docs/` |
| `npm run preview:web` | Serve the built site locally |
| `npm run build:openings` | Regenerate `src/data/openings.json` from lichess-org/chess-openings |
| `npm run dataset:report` | Print classifier metrics against the regression dataset |
| `npm run dataset:build` | Re-analyse the dataset with real Stockfish |
| `npm run dataset:import -- file.pgn --source "..." --license "..."` | Add games to the dataset |
| `npm run dataset:puzzles -- lichess_db_puzzle.csv` | Build puzzle fixtures from a Lichess puzzle CSV |

## Privacy

Everything runs in your browser; Stockfish executes locally as WebAssembly in a Web Worker.

- Saved reviews live in `localStorage` (about 5 MB, per device and browser, not synced). If it fills up, the oldest reviews are dropped.
- The only network request is the optional Chess.com import, which calls the public `api.chess.com` from the page. If your browser blocks it, paste a PGN instead.

## How it works

### Pipeline
Every position is analysed once and cached by FEN and depth. `buildReview` (`src/core/review.ts`) is the single source of truth: each move gets exactly one class plus its before/after evals, phase and flags. The board badge, move list, graph markers, summary counts, phases and rating all read from it.

Evals are stored from White's perspective, converted to win % with a logistic curve (`50 + 50·(2/(1+e^(−0.00368208·cp)) − 1)`), and compared from the mover's side.

### Classification
Thresholds live in `src/core/classify.ts` (`DEFAULT_THRESHOLDS`). Priority order:

**Book > Brilliant > Great > Best > Excellent > Good > Miss > Inaccuracy > Mistake > Blunder**

| Class | Rule (win-% lost from the mover's view) |
| --- | --- |
| **Best** | Engine's top move, or a MultiPV alternative within 0.5 |
| **Excellent** | ≤ 2 |
| **Good** | ≤ 5 |
| **Inaccuracy** | ≤ 10 |
| **Mistake** | ≤ 20 |
| **Blunder** | > 20 |
| **Brilliant** | Best or nearly best (loss ≤ Excellent), a genuine piece sacrifice, still ≥ 40 % afterwards, and the best *alternative* move is not already completely winning (< 95 %, or a mate the alternative lacks). Not a recapture |
| **Great** | A critical top move: the second-best line is ≥ 15 win-% worse, or the best line sits in a better outcome state (losing < 35 %, equal, winning > 65 %) by ≥ 8. Not a recapture or forced single move |
| **Miss** | The opponent's last move was a real mistake (≥ 0.10 expected points), the best move would have been winning (> 65 %) or mate, and your move gave up ≥ 8 win-% without collapsing (a collapse is a Blunder) |
| **Book** | Position is in the Lichess opening DB and you stayed in theory. Checkmating moves are never Book. Book moves are excluded from accuracy and rating |

A sacrifice counts when material is given up along the engine's own continuation (≥ 2 points), or via a static-exchange test: the moved piece (≥ 3 points) can be taken for a net gain, the piece risked exceeds what was captured by ≥ 2, and you end ≥ 1 point down. Even trades never qualify.

### Accuracy, phases and rating
- **Accuracy**: mean of `103.17·e^(−0.04354·loss) − 3.17` per move (a Lichess-style fit), book moves excluded.
- **Phases** (`src/core/phase.ts`): endgame at ≤ 6 minor/major pieces; middlegame at ≤ 10 pieces or a back rank with < 4 pieces; otherwise opening. Phases only move forward. Per-phase accuracy needs ≥ 3 analysed non-book moves.
- **Estimated rating** (`src/core/rating.ts`): the Regan & Haworth intrinsic-performance model, `IPR ≈ 3571 − 15413 × mean scaled error`, using non-book moves in positions within ±3 pawns, needing ≥ 8 such moves, rounded to 50. Shown as n/a if there are too few moves or the result falls outside 400–3000. Treat it as rough: the constants were fitted for a different engine and depth, and short games are noisy.

### Known differences from Chess.com
EvalMate is not affiliated with Chess.com and does not claim parity with its reviews. Chess.com's win-probability curve depends on player rating and it uses a stronger engine. On low-rated games EvalMate tends to show more Inaccuracies and more *Best* (rather than *Excellent*) moves, and its accuracy number will differ. Accuracy here is EvalMate's own estimate.

## Project structure

```
src/
  core/        engine wrapper, review pipeline, classification, phases, rating,
               explanations, sacrifice detection, variations, on-demand analysis
  ui/          React app: board, graph, summary, move list, class icons
  dataset/     regression dataset types, metrics, validation, puzzle import
  data/        generated Lichess openings
  assets/      cburnett piece SVGs
  storage.ts   saved reviews (localStorage)
  export.ts    PGN / JSON / HTML exports
public/        Stockfish WASM build
scripts/       openings builder, dataset CLI, build cleanup
tests/         Vitest suites (engine, classification, variations, graph, dataset)
dataset/       labelled regression data and generated analysis
docs/          built site (served by GitHub Pages)
```

**Stack:** TypeScript, React, Vite, chess.js, Stockfish WASM, Vitest.

## Testing and the regression dataset

`npm test` runs unit tests plus tests against real Stockfish (including the Opera Game, an en-passant/castling game and Fool's mate). The dataset tests run offline from stored Stockfish evals, so they are deterministic.

The dataset exists to **test and calibrate EvalMate's own classifier**, not to copy Chess.com's private rules. See [`dataset/README.md`](dataset/README.md). A reference position from a real Chess.com review (17.Bxa6, marked Brilliant there) lives in `tests/validate.test.ts` and must stay Brilliant.

Want to help calibrate the rating model? Send PGNs together with the Chess.com ratings and classifications shown for them.

## Known limitations

- Standard chess only; variants are rejected.
- Games can't be pulled from an open Chess.com tab. Use the username import or paste a PGN.
- Explanations cover missed captures, checks, mate and allowed piece wins; there is no fork/pin/skewer motif detection yet.
- The analysed-PGN export covers the main line only (variations are not exported).
- The dashboard shows only W/D/L-by-White and average White accuracy.
- Classification uses a fixed win-probability curve (no rating-dependent generosity).
- No automated UI tests.

## License and third-party notices

EvalMate is released under **GPL-3.0** (see [`LICENSE`](LICENSE)). Stockfish is GPL-3.0, so any distribution of EvalMate must stay under GPL-3.0-compatible terms with its source available.

- **Stockfish 19** (GPL-3.0): `public/engine/`, from npm `stockfish@19.0.1`. Source: [official-stockfish/Stockfish](https://github.com/official-stockfish/Stockfish) and [nmrugg/stockfish.js](https://github.com/nmrugg/stockfish.js).
- **Opening data**: [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings) (CC0). Regenerate with `npm run build:openings`.
- **Chess pieces**: "cburnett" set by Colin M. L. Burnett via lichess-org/lila (GPLv2+), in `src/assets/pieces/`. Not Chess.com artwork.
- **Libraries**: chess.js (BSD-2), React (MIT), Vite (MIT).
