# EvalMate — Chess Game Review (v0.2)
Local Stockfish game review as a Manifest V3 Chrome extension. Nothing is uploaded; no telemetry; no API keys.

## Setup (Windows PowerShell)
1. Install Node.js LTS (v20+): `winget install OpenJS.NodeJS.LTS`, then reopen PowerShell. Check: `node -v`
2. In the project folder: `npm install`
3. `npm test`   (unit tests + real-Stockfish tests)
4. `npm run build`   (type-checks, then builds to `dist/`)
5. Chrome → `chrome://extensions` → enable **Developer mode** → **Load unpacked** → choose the `dist` folder.
6. Click the EvalMate toolbar icon → **Open EvalMate**.

## Usage
- **Chess.com:** type your username → *Find games* (latest month, public archive) → click a game. Or finish a game, copy its PGN from Chess.com's share/download dialog, paste it (or upload a `.pgn`) and press **Review Game**.
- Pick Quick (depth 10) / Standard (14) / Deep (18). Cancel any time; an interrupted review is labelled INCOMPLETE and is not saved.
- Keys: ←/→ move, Home/End. Click or drag pieces to explore a variation (not saved, not engine-analysed).

## Permissions
- `storage` — save reviews/preferences locally (~10 MB quota).
- Host `https://api.chess.com/*` — fetch your public game archive. No other site is accessed.
- CSP `wasm-unsafe-eval` — required to run Stockfish WebAssembly. No content script and no `tabs` permission are used.

## Algorithms
Evals are stored from White's perspective; converted to win% (logistic, `50+50*(2/(1+e^(-0.00368208cp))-1)`) and compared from the mover's side. Win-% lost: ≤0.5 Best, ≤2 Excellent, ≤5 Good, ≤10 Inaccuracy, ≤20 Mistake, else Blunder; Miss = lost a ≥85% position without falling below 40%. Great = only good move (second line ≥15 win-% worse). Brilliant = rare: engine-best sacrifice of a ≥3-point piece in a not-already-winning position. Book = position in the Lichess opening DB. Accuracy = mean of `103.17·e^(−0.04354·loss) − 3.17` (book moves excluded). All thresholds: `src/core/classify.ts`. Accuracy is EvalMate's estimate, not Chess.com's.

## Third-party notices
- **Stockfish 19** (GPL-3.0) — `public/engine/`, from npm `stockfish@19.0.1`; license `STOCKFISH-COPYING.txt`. Source: https://github.com/official-stockfish/Stockfish and https://github.com/nmrugg/stockfish.js . Because Stockfish is GPL-3.0, distribute EvalMate under GPL-3.0-compatible terms with this source.
- **Opening data** — lichess-org/chess-openings (CC0). Regenerate: `npm run build:openings`.
- **Chess pieces** — "cburnett" set by Colin M.L. Burnett via lichess-org/lila (GPLv2+), in `src/assets/pieces/`. Not Chess.com artwork.
- chess.js (BSD-2), React (MIT), Vite (MIT).

## Troubleshooting
- *Engine error / timeout:* reload the extension at `chrome://extensions`; try Quick depth; check the page console (F12) for CSP errors.
- *"Failed to fetch" on Find games:* username typo, or offline. Paste a PGN instead.
- *Manifest error on load:* you must select `dist`, not the project root. Run `npm run build` first.
- *Variant rejected:* only standard chess is supported.

## Implemented / not yet
Implemented: PGN paste/upload/Chess.com archive import, real Stockfish review with cancel, classification, accuracy, eval graph, board (click/drag, promotion, flip, check, arrows), error navigation, deterministic explanations, report, history/delete, exports (PGN, analysed PGN, JSON, HTML).
Not implemented / limits: no content script — pulling the game from the open Chess.com tab; variations are single-line sandboxes (no tree, no engine analysis); fork/pin/skewer motif detection (only missed captures/checks, allowed piece-wins and mate are explained); opening-phase is split by move number; dashboard shows only W/D/L-by-White and average White accuracy (no mistake-category or opening charts); no optional LLM explanations; no automated UI tests beyond the manual Playwright run; analysed-PGN export covers the main line only; unicode pieces rather than custom artwork; extension was tested as a static page in headless Chromium, not loaded via chrome://extensions.


## v0.3 — classification, phases and rating (how it works)
**Pipeline.** Every position is analysed once (Stockfish lite, MultiPV 2, depth 10/14/18, cached by FEN+depth). `buildReview` (src/core/review.ts) is the single source of truth: each move gets exactly one class plus its before/after evals, phase and flags; the board badge, move list, graph markers, summary counts, phases and rating are all read from it. Saved reviews are re-classified from their stored evals when opened, so rule changes never leave stale labels.
**Classification** (src/core/classify.ts, thresholds in `DEFAULT_THRESHOLDS`; win-% lost from the mover's view): Book > Brilliant > Great > Best > Excellent (<=2) > Good (<=5) > Miss > Inaccuracy (<=10) > Mistake (<=20) > Blunder.
- *Best*: engine's top move, or a listed MultiPV alternative within 0.5. The played move's own MultiPV line is used when listed (same search, no depth noise).
- *Brilliant*: Best-tier AND a sacrifice AND not a recapture AND still >= 40% afterwards AND not made when already far ahead (win% > 90 AND up >= 4 points of material; a forced mate is exempt). A sacrifice is either (a) material given up along the engine's own continuation (>= 2 points, regained exchanges don't count), or (b) a static-exchange test: the moved piece (>= 3 points) can be taken for a net gain, the piece risked exceeds what the move captured by >= 2, and you end >= 1 point down (so even trades never qualify). (b) is what catches e.g. 17.Bxa6 in the reference game, where the engine's own line never accepts the sacrifice.
- *Great*: engine's only good move (second line >= 15 win-% worse), not a recapture, not a single legal move.
- *Miss*: the opponent's previous move lost >= 8 win-%, you had >= 60% (or a forced mate) and your move gave up >= 8 win-% without collapsing (>= 35%). Collapses are Blunders; ordinary errors without an opponent error are Inaccuracy/Mistake.
- *Book*: position is in the Lichess opening DB (CC0), stays book only while you stay in theory (re-entry by transposition only in the first 12 plies); a checkmating move is never Book. Book moves are excluded from accuracy and rating.
**Phases** (src/core/phase.ts, Lichess-Divider-style): endgame <= 6 minor/major pieces; middlegame <= 10 pieces or either back rank has < 4 pieces; else opening; phases only move forward; each move takes the phase of the position before it. Per-phase accuracy needs >= 3 analysed non-book moves, otherwise "—". The phase icon comes from the phase's average win-% loss.
**Accuracy**: mean of 103.17*exp(-0.04354*loss)-3.17 per move (Lichess-style fit). EvalMate's estimate, not Chess.com's.
**Estimated game rating** (src/core/rating.ts): Regan & Haworth intrinsic-performance model, IPR ~= 3571 - 15413 * mean scaled error, using only non-book moves in positions within +-3 pawns, needing >= 8 such moves, rounded to 50. Shown as n/a (with the reason on hover) if too few moves or if the result is outside 400-3000. Limitations: constants were fitted for another engine/depth, it is NOT calibrated against Chess.com's game ratings (their formula isn't public), decisive one-sided games often yield n/a, and short games are noisy (the same game can differ by hundreds of points between depths). Treat it as rough.
**Calibration data wanted:** to calibrate, supply PGNs together with the Chess.com game ratings/classifications shown for them; the model can then be fitted and checked.
**Tests:** `npm test` (44 tests incl. real-Stockfish validation on the Opera Game, an en-passant/castling game and Fool's mate).

**Reference game (regression test).** The position before 17.Bxa6 from a real Chess.com review (marked Brilliant there) is in tests/validate.test.ts and must stay Brilliant.
**Known differences from Chess.com:** their win-probability curve depends on player rating (flatter for ~1000-rated players) and they use a stronger engine, so EvalMate tends to show more Inaccuracies and more "Best" (vs "Excellent") than Chess.com on low-rated games, and gives a different accuracy number.

## v0.4 — regression dataset (see dataset/README.md)
`npm run dataset:report` (metrics), `npm run dataset:build` (re-analyse with real Stockfish), `npm run dataset:import -- file.pgn --source "..." --license "..."`, `npm run dataset:puzzles -- lichess_db_puzzle.csv`, and in the app **Export > Dataset record (JSON)**. `npm test` = 83 tests (the dataset tests run offline from stored Stockfish evals, so they are deterministic).
Sources actually used: public-domain historical games, a 4-label/2-aggregate Chess.com reference typed from user screenshots, synthetic fixtures, Stockfish (GPL-3.0) evals, Lichess openings (CC0). The Lichess database/puzzles/evals and Chess.com's documentation were not reachable from the build environment, so none were downloaded or read.

## Website version (GitHub Pages)
Same code, second build target: `npm run build:web` writes a static site to `docs/` (`npm run build` still builds the Chrome extension to `dist/`).
Publish: push the repo to GitHub, then Settings > Pages > Source "Deploy from a branch" > branch `main`, folder `/docs`. The site is at `https://<user>.github.io/<repo>/`.
Notes: everything runs in the visitor's browser (Stockfish WASM in a Web Worker; no server). Saved reviews use the browser's localStorage (~5 MB, per device and per browser, not synced). The Chess.com username import calls the public api.chess.com from the page; if the browser blocks it, paste a PGN instead. Stockfish is GPL-3.0, so keep the repository public with `LICENSE` and this source. After changing code, re-run `npm run build:web` and commit `docs/`.

## v0.5 — aligned with Chess.com's published classification rules
Source: Chess.com's support article on move classifications (text/screenshot supplied by the project owner; I could not open it from the build environment).
- **Expected-points bands** (already used): Best 0.00, Excellent <=0.02, Good <=0.05, Inaccuracy <=0.10, Mistake <=0.20, Blunder >0.20. Chess.com's curve depends on player rating; ours is a fixed curve (no rating-dependent generosity: NOT implemented).
- **Brilliant**: best *or nearly best* (loss <= Excellent), a good piece sacrifice, not in a bad position afterwards (>= 40%), and the best *alternative* move is not already completely winning (< 95% win, about +8 pawns; or a mate the alternative does not also have). Previously: capped by the position before the move.
- **Great**: top move that is critical: the second-best line is >= 15 win-% worse, OR the best line is in a better outcome state (losing < 35%, equal, winning > 65%) than the second-best by >= 8. Not recaptures, not forced single moves.
- **Miss**: opponent's last move was a real mistake (>= 0.10 expected points), the best move would be winning (> 65%) or mate, and this move gave up >= 8 win-% without collapsing (collapse = Blunder).
Tests: `npm test` (85 tests). Regression record: Chess.com-verified 2/2, manually-reviewed 7/7 (assistant, not independent); engine-derived agreement 77%.
