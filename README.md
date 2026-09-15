<div align="center">

# ♟️ Chess evals

### Two ways to measure a language model, played out over a chessboard.

**One grades the moves a model makes. The other checks whether what it says
about the position is true.**

<img src="docs/arena.jpg" alt="Two models mid-game with live analysis and Stockfish scorecards" width="100%">

</div>

---

## The idea in one paragraph

Most model comparisons are vibes. Chess is unusual in having a referee —
Stockfish — that is far stronger than any language model, so its verdict is
ground truth rather than another opinion. That turns a comparison into a
scoreboard. This repo points that referee at models twice: once at the moves
they play, and once at the sentences they write about the board.

---

## Try it in 30 seconds

```bash
npm install && npm run dev      # http://localhost:3000
```

No API key, no Python, no Stockfish install. The arena has an offline demo mode,
and the reasoning pages read a finished run that is committed to the repo.

---

## What you can look at

| Route | What it shows |
|---|---|
| `/` | Both headline numbers, and a door into each eval |
| `/arena` | **Two models play a full game**, analysis streaming beside the board, Stockfish grading every move as it lands |
| `/arena/scorecard` | The same frozen positions answered by every model, alone — accuracy, ACPL, blunder rate, with error bars |
| `/reasoning` | Solve rate against **claim accuracy**, and which metrics actually separate the models |
| `/reasoning/traces` | All 600 reasoning traces, filterable |
| `/reasoning/<id>` | One puzzle: the board, what each model wrote, and every claim marked ✓ ✗ ? |

**If you only open one page, make it a trace.** `/reasoning/DxWfR` shows a model
playing the correct move while asserting a check that is not on the board. That
is what the second eval exists to catch, and no percentage can show it to you.

---

## The two evals, briefly

### Eval 1 — the arena

Two models play each other while Stockfish grades every move. A game normally
tells you one thing — who won — which is almost meaningless, since a single game
is a coin flip. Grading every move instead yields ~40 scored decisions per model
per game: accuracy, average centipawn loss, blunder rate, illegal-move rate, and
tokens spent against quality gained.

`/arena/scorecard` is the stricter version underneath it: every model answers an
identical, content-hashed set of positions **alone**, so no opponent's choices
can skew anyone's score. Positions come from engine self-play, so none of them
can be in training data.

### Eval 2 — the reasoning eval

Models solve Lichess puzzles and write out their reasoning. Every factual claim
in that reasoning is extracted and checked against python-chess and Stockfish.

The headline is the **gap** between how often a model picks the right move and
how often the things it says are true. A model can solve a puzzle while
describing a pin that does not exist — solve rate cannot see that, because it
reports one bit per puzzle. Checking the reasoning turns one puzzle into roughly
six verifiable assertions.

**The finding so far:** line-claim accuracy — whether a calculated variation
actually plays out — is the only measure that cleanly separates the three models
tested (28.1% to 55.9%, non-overlapping intervals). Solve rate does not. Neither
does claim accuracy overall. Full numbers in **[RESULTS.md](RESULTS.md)**.

---

## What is actually in this repo

Two independent projects sharing a directory, a design system and a nav bar.
They share no runtime, no package manager and no engine binding.

| | What it is | Size | Stack |
|---|---|---|---|
| `src/app`, `src/components`, `src/hooks` | The web app — all six routes above | ~4,600 lines | Next.js 16, React 19, Tailwind 4 |
| `src/lib` | Arena match loop, prompts, parsing, Stockfish WASM binding | ~1,300 lines | TypeScript |
| `src/bench` | The frozen-position benchmark behind `/arena/scorecard` | ~900 lines | TypeScript |
| `src/reasoning` | Reads the Python pipeline's output and joins it for the web app | ~550 lines | TypeScript |
| `eval/` | **The reasoning eval pipeline** — five stages, tasks → run → extract → verify → score | ~3,600 lines | Python 3.12, python-chess |
| `data/` | A finished run: 200 puzzles, 3 models, 600 traces, ~3,900 claims with verdicts | ~7 MB | JSONL |
| `bench/` | The frozen position set and published arena results | 52 KB | JSON |
| tests | 155 TypeScript + 179 Python, all passing | ~2,500 lines | vitest, pytest |

### Documentation

| File | |
|---|---|
| **[RESULTS.md](RESULTS.md)** | The reasoning eval's numbers, with error bars and limitations |
| [RESULTS_slices.md](RESULTS_slices.md) | Accuracy cut by claim kind, rating band and plan soundness |
| [docs/reasoning-pipeline.md](docs/reasoning-pipeline.md) | How each pipeline stage works, and why |
| [AUDIT.md](AUDIT.md) | What this repo was before, and what survived the change |

---

## Running things that cost money

Everything above is free. These are not.

```bash
echo "AI_GATEWAY_API_KEY=your_key" > .env.local
```

One key from the [Vercel AI Gateway](https://vercel.com/docs/ai-gateway) covers
Anthropic, OpenAI, Google and open-weight models at provider list price.

| | Command | Cost |
|---|---|---|
| A live arena match | pick real models in the UI, press Start | ~2¢ to $5, by tier |
| The arena benchmark | `npm run bench -- --set bench/sets/core-v1.json --models a,b --publish` | cents per model |
| A full reasoning run | `uv run python -m eval run --config config/models.yaml --stage all` | **$24 for the run on disk** |

> [!WARNING]
> Both are unattended loops making dozens to hundreds of API calls. **Set a
> budget cap before starting one.** The reasoning pipeline enforces
> `limits.max_cost_usd` from `config/models.yaml`; the arena shows a live cost
> meter but does not stop itself.

The reasoning pipeline also needs Python and a **native** Stockfish binary
(`brew install stockfish` — the WASM build on npm will not work, since
python-chess speaks UCI over stdio). Neither is needed to browse results.

```bash
npm test        # 155 TypeScript tests
uv run pytest   # 179 Python tests
```

---

## Things this does not claim

Worth knowing before trusting any number here.

- **The reasoning eval's puzzles may be in training data.** The Lichess export
  carries no puzzle creation date, so the intended recency filter had nothing to
  filter on. Nothing separates recall from reasoning.
- **Claim extraction is done by a model, not an oracle.** A claim the extractor
  misses is one the model under test is never held to, and that error rate is
  currently unmeasured.
- **The last verification run stopped at 570 of 600.** One model is short 30
  runs; the pages mark it rather than hiding it.
- **The arena's benchmark is small.** 30 positions is enough to order models and
  not enough to separate them, and the page says so instead of implying a
  ranking it cannot support.

Every published number carries a 95% bootstrap confidence interval, and prompts
are content-hashed so that changing the instrument fails the build rather than
quietly invalidating old scores.

---

## Stack

TypeScript · Next.js 16 · React 19 · Tailwind 4 · Stockfish 18 WASM ·
chess.js · AI SDK 7 — and — Python 3.12 · [uv](https://docs.astral.sh/uv/) ·
[python-chess](https://python-chess.readthedocs.io) · native Stockfish · httpx
