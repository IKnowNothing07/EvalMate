# EvalMate ♞ — Chess Game Review in your browser

EvalMate reviews a finished chess game with the **Stockfish** engine and shows you what happened: an evaluation graph, a label for every move (Brilliant, Great, Best, … Blunder), accuracy, game phases, and the engine's best continuation from any position. Everything runs **on your own device**; your games are never uploaded.

**Live site:** https://iknownothing07.github.io/EvalMate/

---

## Features

- **Import games**
  - Chess.com: type a username and EvalMate lists every standard game from the **last 30 days** (across months). The username is remembered on your device. First visit? Click **Try an example: MagnusCarlsen** to see how it works (the example is never saved as your username).
  - Or paste a PGN / upload a `.pgn` file.
- **Real engine analysis** — Stockfish 19 (WebAssembly, in a Web Worker) analyses every position. Choose Quick, Standard or Deep. A loading page shows live progress.
- **Move classification** — Brilliant, Great, Best, Excellent, Good, Book, Inaccuracy, Mistake, Miss, Blunder, with Chess.com-style icons and colours.
- **Summary** — accuracy per side, move counts, Opening / Middlegame / Endgame performance, and an *estimated* game rating.
- **Evaluation graph** — smooth curve through the exact engine values; click or drag to jump to any move. Synced with the board, move list and evaluation bar.
- **Interactive board** — click or drag pieces, flip, promotion choice, best-move arrow.
- **Explore variations** — see the engine's best continuation at any position, play it or make your own moves, and keep going. The original game and its graph are never changed; only the evaluation bar follows the position you are looking at.
- **Export** — original PGN, annotated PGN, JSON report, HTML report, and a dataset record.
- **Saved reviews** — stored locally in your browser, with search, delete and storage meter.
- **Also a Chrome extension** — the same code builds as a Manifest V3 extension.

## How to use it

1. Open the live site.
2. Enter your Chess.com username and press **Find games**, or paste a PGN.
3. Pick a strength and press **Review Game** (or click a game in the list).
4. Wait for the "Evaluating the game" page to finish, then step through the moves with the arrow keys, the buttons, or the graph.
5. Use **Play …** in the *Best continuation* card to explore the engine's suggestion, and **Back to game** to return.

## Run it locally

Requirements: **Node.js 20+** and **git**. (On Windows, WSL works well.)

```bash
git clone https://github.com/IKnowNothing07/EvalMate.git
cd EvalMate
npm install

npm test                  # unit + browser-free engine tests (real Stockfish)
npm run build:web         # build the website into docs/
npm run preview:web       # serve docs/ at http://localhost:4173
```

| Command | What it does |
|---|---|
| `npm run build:web` | Type-check, then build the website into `docs/` |
| `npm run preview:web` | Serve the built website locally |
| `npm run build` | Build the Chrome extension into `dist/` |
| `npm run typecheck` | TypeScript check only |
| `npm test` | Run all automated tests |
| `npm run dataset:report` | Classifier accuracy report on the regression dataset |
| `npm run dataset:build` | Re-analyse the dataset games with Stockfish |
| `npm run dataset:import -- file.pgn --source "…" --license "…"` | Add your own games to the dataset |
| `npm run build:openings` | Rebuild the opening database from Lichess data |

### Chrome extension

```bash
npm run build
```

Then open `chrome://extensions`, turn on **Developer mode**, choose **Load unpacked**, and select the `dist` folder.

## Deploy to GitHub Pages

The site is served from the `docs/` folder of the `main` branch.

1. `npm run build:web`
2. `git add . && git commit -m "update" && git push`
3. In the repository: **Settings → Pages → Source: Deploy from a branch → `main` / `/docs`**.

## How it works (short version)

1. **PGN → positions** (`chess.js`): every move gets a validated position.
2. **Stockfish** evaluates each position (two best lines). All scores are stored from White's point of view and converted to the mover's view only when comparing.
3. **Win probability** is computed from the evaluation, and each move is classified by how much win probability it **lost** compared with the engine's best move, plus special rules for Brilliant (a sound piece sacrifice), Great (an important only-move), Miss (not punishing an opponent's mistake) and Book (Lichess opening database).
4. **Accuracy and phases** are computed from the same data; the opening phase is detected from the position, not the move number.
5. One `Review` object feeds the board, move list, graph and summary, so they can never disagree.

Code map:

```
src/core/      PGN parsing, engine wrapper, evaluation, classification, accuracy,
               phases, rating, openings, variations, on-demand analysis
src/ui/        React components: board, graph, summary, loading page, app shell
src/chesscom.ts  Chess.com public-API import (last 30 days)
src/dataset/   Tools for testing the classifier against labelled data
dataset/       Regression dataset (games, labels with provenance, stored evals)
tests/         Automated tests (Vitest)
docs/          Built website (GitHub Pages)
public/engine/ Stockfish WebAssembly files
```

## Accuracy of the labels — please read

EvalMate is **inspired by** Chess.com's Game Review but is an **independent approximation**. Chess.com's exact algorithm is not public, so labels will sometimes differ.

- The loss bands for Best/Excellent/Good/Inaccuracy/Mistake/Blunder follow Chess.com's *published* expected-points table. Chess.com's win-probability curve depends on the player's rating; EvalMate uses one fixed curve.
- Brilliant, Great and Miss follow Chess.com's published descriptions, implemented with Stockfish. Great-move detection in particular is basic and is being improved.
- **Accuracy** and the **estimated game rating** are EvalMate's own estimates. The rating is rough, is often shown as "n/a" when there isn't enough data, and is not Chess.com's number.
- The regression dataset contains very few Chess.com-verified labels (see `dataset/README.md`), so EvalMate does **not** claim to match Chess.com.
- The engine is the lightweight single-thread Stockfish build, so it is weaker and slower than desktop Stockfish; results can differ at low depth.

## Privacy

- Games are analysed in your browser. There is no EvalMate server.
- The only network request is to Chess.com's public API when you press **Find games**, made directly from your browser.
- Saved reviews and your last username are stored in your browser's local storage on that device only (not synced).
- No analytics or tracking.

## Limitations

- Standard chess only (Chess960 and other variants are skipped).
- Variations you explore are not saved and are not given Best/Mistake labels.
- If a browser blocks the Chess.com request, paste a PGN instead.
- Reviews are per browser and device.

## License and credits

EvalMate is released under the **GNU GPL v3** (see `LICENSE`), because it includes Stockfish.

- [Stockfish](https://stockfishchess.org/) 19 — GPL-3.0 (via the [`stockfish`](https://www.npmjs.com/package/stockfish) npm package)
- [chess.js](https://github.com/jhlywa/chess.js) — BSD-2-Clause
- [React](https://react.dev/), [Vite](https://vite.dev/), [Vitest](https://vitest.dev/) — MIT
- Chess pieces: "cburnett" set by Colin M. L. Burnett via [Lichess](https://github.com/lichess-org/lila) — GPLv2+
- Opening names and ECO codes: [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings) — CC0
- Icon paths: Material Design Icons — Apache-2.0

EvalMate is not affiliated with Chess.com or Lichess.
