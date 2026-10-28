# ChessIQ move-classification dataset

Purpose: **test and calibrate our own classifier**. It is NOT a copy of Chess.com's private rules, and nothing here lets us claim parity with Chess.com.

## Files
| file | what | provenance |
|---|---|---|
| `games.json` | PGN sources (+ license, origin, difficulty tags) | n/a |
| `labels.chesscom.json` | labels read by a human in a **Chess.com Game Review** | `chesscom-verified` |
| `aggregates.chesscom.json` | whole-game Chess.com summaries (counts, accuracy, game rating) | `chesscom-verified` |
| `labels.manual.json` | labels from a reviewer (currently the assistant; **not independent**) | `manually-reviewed` |
| `generated/analysis.json` | real Stockfish evals (MultiPV 2) at test depth and reference depth, per position | produced by `npm run dataset:build` |
| `imported/*` | your own imports (`dataset:import`, `apply-labels`, `dataset:puzzles`) | as stated per record |

Provenance values: `chesscom-verified`, `engine-derived`, `puzzle-theme-derived`, `manually-reviewed`, `database-derived`. **Our classifier's output is never stored as a label** (it lives in tests/reports as a *prediction*).

## Data sources, licensing, and what was actually obtainable
| source | status here | license / terms |
|---|---|---|
| Lichess open database, puzzles, evals (database.lichess.org) | **Not reachable from the build environment (blocked), so NOT downloaded.** Importer for the puzzle CSV is implemented (`npm run dataset:puzzles -- file.csv`) and unit-tested on a synthetic fixture only. | CC0 (Lichess states its database is released under Creative Commons CC0) |
| Lichess openings (github lichess-org/chess-openings) | used for Book detection | CC0 |
| Chess.com classification documentation | **Not reachable, not read.** Expected-points bands in `src/dataset/reference.ts` are from memory and **unverified**. | Chess.com terms apply |
| Stockfish | engine used: `stockfish@19.0.1` npm build (lite, single-thread WASM) | GPL-3.0 |
| Historical games (Opera 1858, Immortal 1851, Evergreen 1852, Légal 1750, textbook mates, Loyd stalemate) | transcribed from memory; each is validated legal by chess.js and ends in the expected mate/stalemate | public domain (game moves are facts) |
| Chess.com reference game 185958600578 | only a fragment typed from a user's screenshot (position before 17.Bxa6 + labels visible in the review). No scraping of Chess.com. | user-supplied; do not redistribute without checking Chess.com terms |
| Synthetic fixtures | written for this repo | CC0 |

## Label caveats
- `chesscom-verified`: transcribed by hand from screenshots; a typo in a FEN or label is possible. Chess.com shows icons only for notable categories, so "no icon" is NOT a label and is not stored.
- Four verified items exist: 2 testable (17.Bxa6 Brilliant, 17...bxa6 Mistake) and 2 not testable until the full PGN is supplied (14.Ne4 Great, 16...Qd5 Blunder). Two aggregates (counts, accuracy, game rating) are stored but not comparable without PGNs.
- `engine-derived`: only the six loss classes (best, excellent, good, inaccuracy, mistake, blunder) can be derived from an engine. Brilliant, Great, Miss and Book cannot.

## Workflow to extend it (the way to get real calibration)
1. In ChessIQ open a game, **Export > Dataset record (JSON)** (or run `npm run dataset:import -- game.pgn --source "..." --license "..."`).
2. Open the same game in Chess.com Game Review. In `dataset/imported/labels-template.csv` fill `chesscom_label` for the moves where you can read the label (blank = unknown).
3. `npx tsx scripts/dataset.ts apply-labels dataset/imported/labels-template.csv --source "Chess.com Game Review, <url>"`
4. `npm run dataset:report`. A class is only called `reliable` with >= 30 labelled examples and F1 >= 0.8; otherwise `unreliable` or `insufficient-evidence`.

## Difficult cases and known disagreements
- **Celebrated but engine-unsound sacrifice:** Evergreen Game 17.Nf6+ is historically famous, but Stockfish (depth 12 and 16) rates it a blunder. I removed my "brilliant" manual label for it because an engine-based review (like Chess.com's) would not call it brilliant either; it stays in `games.json` as a losing-sacrifice case judged by the engine-derived reference.
- **Used-for-calibration label:** `cc185958600578-17b-bxa6` (Chess.com: Mistake) first failed (ChessIQ said Inaccuracy because the position was already ~95% lost). I added a "mate-allowed floor" rule. That makes this label calibration data, not an independent test.
