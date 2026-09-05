# Audit — repurposing the arena into a chess reasoning eval

Read against the whole tree at `103eb43`. The conclusion up front: **almost
nothing here survives as code, and a fair amount survives as design.** The
existing repo is a TypeScript/Next.js application; the new product is a Python
CLI pipeline. There is no shared runtime, no shared package manager and no
shared engine binding. Every "reusable" item below is a port, not a move.

That is not an argument for starting from an empty directory. Several of the
things this repo got right are exactly the things a reasoning eval gets wrong —
frozen hashed prompts, error bars on headline numbers, refusing to score an
infrastructure failure as a model failure — and those decisions are worth
carrying over deliberately rather than rediscovering.

---

## 1. What this repo currently does

**LLM Chess Arena.** Two language models play a full game of chess against each
other in the browser while Stockfish grades every move.

- `src/app/arena` drives a client-side match loop (`useMatch`). Each ply POSTs
  to `/api/ply`, which calls a model through the Vercel AI Gateway and streams
  back reasoning and a `<move>SAN</move>` tag over SSE. Illegal moves are fed
  back and retried up to three times.
- `useEngine` grades each played position with Stockfish 18 WASM in a Web
  Worker, producing centipawn loss, a Lichess-scale accuracy percentage, and
  quality bands (best/good/inaccuracy/mistake/blunder).
- `src/app/page.tsx` renders a leaderboard from published run files in
  `bench/results/`.

There is also a **headless benchmark runner**, which is the closer relative of
the new product:

- `scripts/gen-positions.mts` generates a frozen, content-hashed position set
  from engine self-play (`bench/sets/core-v1.json`, 120 positions, hash
  `0e1484c4`, balanced 30 per category and across side-to-move).
- `scripts/bench.mts` runs every model over the identical positions, enforces a
  cost cap, writes a reproducibility manifest, and reports accuracy with
  bootstrap confidence intervals.

Storage is JSONL plus JSON manifests. There is no database. 76 tests across
parsing, prompts, grading and set integrity.

**The measurement it makes is move quality.** The new product measures something
the arena never looked at: whether the sentences a model writes about a position
are *true*.

---

## 2. Reusable

Split by whether the thing is code, an idea, or an artifact.

### Design decisions worth carrying over verbatim

These are the load-bearing ones. Each already exists in this repo and each has
an obvious home in the new pipeline.

| Decision | Where it lives now | Where it goes |
|---|---|---|
| Prompts are frozen, versioned and content-hashed; the hash is stamped on every record and manifest | `src/lib/prompt.ts`, `promptHash()` | `runner/prompt.py` — and the extractor prompt needs the same treatment, since changing it silently invalidates every claim ever extracted |
| Infrastructure failure aborts the run rather than scoring as a model failure | `scripts/bench.mts`, `MAX_CONSECUTIVE_ERRORS` | `runner/`, `extractor/` |
| Every run emits a manifest: input hashes, engine build, depth, models, cost cap | `scripts/bench.mts` | shared `eval/manifest.py` |
| Bootstrap CIs on headline numbers, seeded so a published interval reproduces exactly | `src/bench/grade.ts::bootstrapCI` | `scorer/` — load-bearing for the kill check, see §5 |
| Transient vs. fatal error classification, backoff on the former only | `src/lib/errors.ts` | `runner/client.py` |
| Engine evaluations cached by FEN across models | `scripts/bench.mts` | `verifier/` |
| Mate scores mapped into the centipawn scale (`±(10000 − n·10)`) and normalised to White | `src/bench/engine-node.ts`, `src/lib/engine.ts` | `verifier/engine.py` |
| Stratified sampling so a truncated run stays balanced across strata | `scripts/bench.mts::stratifiedSample` | `tasks/`, `runner/` |

### Algorithms worth porting (small, tested, correct)

- `src/lib/accuracy.ts` — Lichess win-percentage and move-accuracy formulas,
  and `evalError`. ~25 lines of Python. Useful for making `plan_cp_loss`
  legible in RESULTS.md next to the raw centipawns.
- `src/lib/chess-utils.ts::classify` — centipawn loss to quality band.
- `src/lib/parse-move.ts` — the *shape* is what ports: last tag wins, fall back
  to a heading scope, then clean. The new contract is
  `<reasoning>/<plan>/<move>` with UCI rather than SAN, so the regexes are
  rewritten but the fallback policy is not.
- `src/bench/ask.ts` — the retry ladder: illegal-move retry with the legal move
  list fed back, wrapped in a separate transient-error backoff, with a hard
  per-request timeout. The new spec asks for exactly one illegal retry rather
  than three; the structure is otherwise the same.

### Storage

JSONL, already the convention here, matches the spec's contracts exactly
(`tasks.jsonl`, `runs.jsonl`, `claims.jsonl`, `verified.jsonl`). **Keep JSONL;
do not introduce SQLite.** Append-only files are also what makes "resume from
cache" and "run one stage from the previous stage's output" trivial, which is a
hard requirement.

### Artifacts

- `bench/sets/core-v1.json` — 120 self-play positions with engine-ranked moves.
  Not puzzles: no ground-truth solution line, no rating, no themes. Nothing in
  the new pipeline can consume it. **Keep the file only if you want a future
  contamination-free comparison set; it has no Week 1 use.**
- `.env.local` holds `AI_GATEWAY_API_KEY`. The new runner uses OpenRouter, so a
  new key is needed regardless (see §5).

### Not reusable, despite appearances

- **The Stockfish binaries.** `public/stockfish/*.wasm` and the `stockfish` npm
  package ship WebAssembly builds only. `python-chess`'s engine API speaks UCI
  to a **native executable over stdio** and cannot drive these. A real
  Stockfish binary must be installed; see §5.
- **`src/lib/models.ts`.** A Gateway model registry carrying UI accent colours,
  picker tiers and per-vendor thinking-budget knobs. The new config is
  `config/models.yaml` against OpenRouter. Only the *idea* of per-vendor
  reasoning configuration survives.
- **`src/lib/cost.ts`.** Priced off the Gateway catalogue endpoint. OpenRouter
  reports cost per response directly, which is better — no rate table to drift.

---

## 3. Delete

Everything below is either UI, explicitly out of scope ("No web viewer in this
pass. Do not build UI."), or Node/Next scaffolding with no Python equivalent.

**Application and UI** — `src/app/` (layout, both pages, `globals.css`,
`favicon.ico`, both API routes), `src/components/` (all 9), `src/hooks/`
(`useMatch.ts`, `useEngine.ts`), `src/types/stockfish.d.ts`, `public/`,
`docs/arena.jpg`, `docs/demo-mode.jpg`.

**UI-only library code** — `src/lib/demo.ts` and `demo-timing.test.ts` (the
offline scripted player exists to exercise the arena without a key);
`src/lib/review.ts` and `review.test.ts` (ply-selection state for the move
inspector); `src/lib/engine.ts` (browser Worker wrapper); `src/lib/types.ts`
(`MoveRecord`, `Scorecard`, `LiveThought` — all arena shapes).

**Leaderboard** — `src/bench/leaderboard.ts` and its test. It groups published
runs into boards per condition and ranks them for the web page. The new scorer
writes `results.json` and a markdown table. The one idea worth keeping is
`overlaps()`: refusing to imply a ranking the sample size cannot support. That
is two lines in the new scorer, not a ported module.

**Node and Next scaffolding** — `package.json`, `package-lock.json`,
`node_modules/`, `next.config.ts`, `next-env.d.ts`, `tsconfig.json`,
`tsconfig.tsbuildinfo` (a build artifact that should never have been committed),
`postcss.config.mjs`, `eslint.config.mjs`, `vitest.config.mts`,
`scripts/copy-stockfish.mjs`, `.vercel/`, `.next/`.

**Stale output** — `runs/` (five old benchmark runs; already gitignored),
`bench/results/*.json` (published arena results, superseded).

**`AGENTS.md` / `CLAUDE.md`** — the instruction block is written and re-added by
`next dev` and is about a Next.js version whose docs live in `node_modules`.
Once Next is gone the file has no author and no subject. It should go with it.

---

## 4. Rewrite

Concept survives, code does not. Rough sizes are for the Python that replaces
each.

| Existing | Becomes | Note |
|---|---|---|
| `scripts/gen-positions.mts` | `tasks/build.py` | Completely different source: Lichess puzzle DB rather than engine self-play. Only stratification and content-hashing carry over. |
| `src/bench/ask.ts` | `runner/ask.py` | Retry ladder ports; AI SDK `generateText` → `httpx` against OpenRouter; new output contract; hidden-thinking capture is new. |
| `scripts/bench.mts` | `runner/run.py` | Manifest, cost cap, stratified sample, per-model loop all port. Caching becomes keyed on `(task_id, model)` rather than positional. |
| `src/bench/engine-node.ts` | `verifier/engine.py` | 202 lines of hand-rolled UCI plumbing collapse to a thin wrapper over `chess.engine.SimpleEngine`. The single-process constraint disappears. |
| `src/bench/grade.ts` | `scorer/aggregate.py` | Grading is centipawn-based today; the new headline is claim accuracy. `bootstrapCI` ports nearly verbatim. |
| `src/lib/prompt.ts` | `runner/prompt.py` | FEN + ASCII board + side to move is the same construction (`chess.Board` renders ASCII natively). Output contract and hashing discipline carry over. |
| `README.md` | rewrite | Describes a different product end to end. |

**New with no ancestor here:** `extractor/` (reasoning → atomic claims) and the
claim handlers in `verifier/` (pinned, attacked, defended, hanging, material
balance, in_check, mate_in_n, square_controlled, piece_on_square, castling
rights, passed pawn). These are the actual product and they start from nothing.

---

## 5. Findings that block or shape the plan

Four things surfaced during the audit that change what gets built. The first is
a genuine spec conflict.

### 5.1 The Lichess puzzle DB has no creation date — the date filter cannot be implemented as written

Verified against `database.lichess.org` on 2026-09-05. The export's columns are:

```
PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags,DailyDate
```

`DailyDate` is the timestamp of the day a puzzle was *featured as the daily
puzzle*, and is empty for all but a few thousand of the ~6.06M puzzles. There is
no per-puzzle creation date in the export at all, so **"filter to puzzles
created after 2026-06-01" has nothing to filter on.** The current snapshot is
dated 2026-08-02.

I read the intent as contamination control — puzzles postdating the models'
training data. Worth saying plainly: no available filter actually achieves that,
and the closest proxies are weak. This needs a decision (see the question in
§6).

### 5.2 The puzzle FEN is not the position the solver sees

From the same source, verbatim:

> "FEN is the position before the opponent makes their move. The position to
> present to the player is after applying the first move to that FEN. The second
> move is the beginning of the solution."

So `tasks.jsonl`'s `fen`, `side_to_move` and `solution_uci` must all be derived
*after* applying `Moves[0]`. Getting this wrong yields a bank where every task
asks the wrong side to move and every solution is off by one — and it would look
plausible right up until the solve rates came back near zero. Flagging it here
because it is the single highest-consequence detail in module 1. No decision
needed; I will implement it correctly and test it.

### 5.3 The toolchain is entirely absent from this machine

Checked directly:

| Required | Status |
|---|---|
| Python 3.12 | absent — system Python is 3.9.6 |
| `uv` | absent |
| Stockfish native binary | absent (`stockfish not found`) |
| OpenRouter API key | absent — `.env.local` holds only `AI_GATEWAY_API_KEY` |

The WASM builds in `node_modules` and `public/` cannot substitute for the
binary, per §2. `brew install stockfish` and the standard `uv` installer resolve
the first three; the key is yours to supply.

### 5.4 `claim_accuracy` has a denominator problem worth knowing about now

`claim_accuracy = true / (true + false)` excludes unverifiable claims from the
denominator. A model that writes vague, hedged prose produces mostly
`unverifiable` claims and can therefore score a *high* claim accuracy on a
denominator of three — while a model that commits to twenty checkable
assertions and gets two wrong scores lower. The metric as specified rewards
vagueness.

`unverifiable_rate` is already in the spec and sits right next to it, which
mitigates the reading but does not fix the ranking. Two cheap guards, neither of
which changes the specified contract: report the raw `(true, false,
unverifiable)` counts alongside every rate, and report `verified_claims_per_task`
so a small denominator is visible rather than inferred. I plan to include both
unless you object.

---

## 6. Open questions

Only one is blocking.

**Blocking — the date filter (§5.1).** Given there is no creation date, which do
you want?

1. **Drop the filter.** Use the full 2026-08-02 snapshot, stratify by rating as
   specified, and state plainly in RESULTS.md that contamination is not
   controlled in Week 1. Honest, and it unblocks everything today.
2. **Proxy recency with `NbPlays`.** Newer puzzles have been played less, so a
   low-`NbPlays` filter skews recent. It is a correlation, not a guarantee, and
   it also skews toward unpopular and low-quality puzzles — which is a different
   confound, not an absence of one.
3. **Use `DailyDate > 2026-06-01`.** Faithful to the literal instruction, but it
   is a "was featured" date, the eligible pool is a few thousand puzzles, and
   daily puzzles are curated — so the sample would be neither random nor large
   enough to fill 4 bands × 50.

I recommend (1), with the limitation stated in RESULTS.md rather than papered
over. It is the only one of the three that does not quietly claim a property the
data cannot support.

**Non-blocking, defaults noted, say the word to change them.**

- **Models.** One Claude, one OpenAI, one open-weight reasoning model, on
  OpenRouter. I will propose three specific IDs with a cost estimate in the plan
  rather than picking silently.
- **Stockfish install.** I can run `brew install stockfish` when you give the go,
  or leave it to you and document it in the README. It is an install on your
  machine, so I would rather ask.
- **Repo history.** The arena is 11 commits and a working product. The deletions
  in §3 are large and irreversible in the working tree. Default is to remove the
  files in normal commits on this branch, so `main` and the history keep the
  arena intact. Say if you would rather tag it first.
