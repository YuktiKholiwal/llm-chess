# Chess reasoning eval

**Models solve chess puzzles and write out their reasoning. Every factual claim
in that reasoning is extracted and checked against python-chess and Stockfish.**

The headline number is the **gap** between how often a model picks the right
move and how often the things it says about the position are true.

That gap is the point. A model can solve a puzzle while describing a pin that
does not exist, a defender that is not there, or a passed pawn an enemy pawn
still holds up. Solve rate alone cannot see any of that — it reports one bit
per puzzle and treats a lucky guess and a sound calculation as the same event.
Checking the reasoning turns a single puzzle into a dozen independently
verifiable assertions.

---

## Pipeline

Five stages, each with a JSON contract, each runnable alone from the previous
stage's output on disk.

```
tasks  →  runner  →  extractor  →  verifier  →  scorer
  │          │           │             │           │
  │          │           │             │           └─ results.json, RESULTS.md
  │          │           │             └─ verified.jsonl   python-chess + Stockfish
  │          │           └─ claims.jsonl                   reasoning → atomic claims
  │          └─ runs.jsonl                                 OpenRouter, cached per (task, model)
  └─ tasks.jsonl                                           Lichess puzzles, stratified by rating
```

Caching is what makes this usable. The expensive stage is `run`; every later
stage reads its file. You can rewrite the extractor and rescore all day without
sending another request to a model under test.

---

## Setup

**Stockfish** must be a native binary. The WebAssembly builds on npm will not
work — `python-chess` speaks UCI to an executable over stdio.

```bash
brew install stockfish          # macOS
sudo apt install stockfish      # Debian/Ubuntu
stockfish quit                  # should print a version banner
```

Point `engine.path` in `config/models.yaml` at an absolute path if it is not on
your `PATH`.

**Python 3.12 and dependencies**, via [uv](https://docs.astral.sh/uv/):

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
uv sync
```

**An OpenRouter key**, which covers every model including the extractor:

```bash
cp .env.example .env
# paste a key from https://openrouter.ai/keys
```

---

## Running it

```bash
uv run python -m eval run --config config/models.yaml --stage all
```

`--stage` also takes `tasks`, `run`, `extract`, `verify` or `score` to run one
stage alone. Useful flags:

| Flag | |
|---|---|
| `--limit N` | cap the task count, sampled evenly across rating bands |
| `--models a,b` | restrict to some of the models in the config |
| `--max-cost N` | USD ceiling for this invocation |
| `--dry-run` | report what would be requested, send nothing |
| `--force` | ignore cached rows and redo the work |

A first run downloads the ~300MB Lichess puzzle export. It stays compressed;
the build streams through it once.

```bash
uv run pytest                                    # the test suite
uv run python scripts/eval_extractor.py --seed 50   # traces to hand-label
uv run python scripts/eval_extractor.py             # extractor recall/precision
```

---

## What each stage does

### tasks

Builds a 200-puzzle bank from the Lichess export: four rating bands (1200,
1600, 2000, 2400) of 50 each, sampled with a seeded reservoir so the draw is
uniform over all 6.1M rows rather than a slice of Lichess's export ordering.
Bands are separated by a tolerance rather than made adjacent — a 1400 puzzle is
evidence about neither the 1200 nor the 1600 cohort.

Two details in the source file drive the code:

**The FEN column is not the position a solver sees.** Lichess documents it as
the position *before* the opponent's move; the puzzle starts after applying the
first move, and the solution begins at the second. Skip that offset and every
task asks the wrong side to move with a solution shifted by one — which raises
nothing, and merely looks like models that cannot solve puzzles.

**There is no puzzle creation date.** The columns are `PuzzleId, FEN, Moves,
Rating, RatingDeviation, Popularity, NbPlays, Themes, GameUrl, OpeningTags,
DailyDate`, and `DailyDate` marks the day a puzzle was *featured*, absent for
almost all of them. A recency filter has nothing to filter on, so contamination
is **not** controlled here and RESULTS.md says so.

### runner

Asks each model for a move through OpenRouter, with a frozen, content-hashed
prompt: FEN, ASCII board, side to move, and a required
`<reasoning>/<plan>/<move>` reply. Provider-side thinking is captured where the
API exposes it and left null otherwise.

One retry on an illegal move, with the legal move list supplied. It is withheld
the first time because reading legality off the position is part of what is
being measured; withholding it twice would only measure the same failure again.

Cost comes from the provider's own usage report, so there is no local rate
table to drift. Rate limits back off; auth and billing failures fail at once;
three consecutive request failures stop the run, because an unreachable API is
not a model scoring zero.

### extractor

Rewrites each reasoning trace as a list of atomic claims, typed `state`,
`threat`, `plan` or `unverifiable`, with a structured form where one fits.

Its central instruction is that it **transcribes and never judges**. An
extractor that quietly corrects a wrong claim stops measuring the model under
test and starts measuring its own chess. Truth is decided later.

Claims may be negated — reasoning is full of "the knight is *not* defended", and
without a way to say so every negative assertion would land in the unverifiable
bucket. That loss would not be neutral: negative claims are where careless
reasoning most often goes wrong.

### verifier

Eleven handlers over python-chess: `pinned`, `attacked`, `defended`, `hanging`,
`material`, `check`, `mate_in`, `controls_square`, `piece_on_square`,
`castling_rights`, `passed_pawn`. Each returns true, false, or **unverifiable**
— a distinct third value, because scoring an unanswerable claim as false would
blame a model for the extractor's silence.

`mate_in` is the one that a rules library cannot answer and defers to Stockfish.

Plan claims are scored by the centipawn loss of the move they imply, at depth
20. That move is read from the text where the plan names it, and only otherwise
resolved by a model call. A plan that resolves to nothing is left unscored
rather than assumed to be the played move.

This is the module the eval rests on, so it is the one with real tests: every
handler against hand-built positions chosen to separate it from the mistake it
is most likely to make — a real pin from a blocked one, a hanging piece from a
defended one, a passed pawn from one an enemy pawn still holds up.

### scorer

Per model, per model × band, per model × motif:

| | |
|---|---|
| `solve_rate` | move equals the first move of the solution |
| `claim_accuracy` | true / (true + false) |
| `unverifiable_rate` | share of claims nothing could check |
| `plan_cp_loss_median` | how much the engine dislikes the plan's move |
| `consistency` | the stated plan's move is the move played |
| `reasoning_outcome_gap` | `solve_rate − claim_accuracy` |
| `cost_per_task` | |

Confidence intervals resample **whole tasks**, not individual claims. Claims
from one trace are correlated, and resampling them independently would report
an interval far narrower than the evidence supports.

`claim_accuracy` excludes unverifiable claims from its denominator, as
specified — which means it **rewards vagueness**: a model that hedges
everything into unverifiable prose can score well on a denominator of three. It
is therefore always published beside its raw counts and claims-per-task, so a
thin denominator is visible rather than something a reader has to infer.

---

## Layout

```
config/models.yaml       models, engine, limits, task sampling
eval/
├── __main__.py          the one entry point
├── config.py            typed config, .env loading
├── store.py             JSONL read/append, cache keys
├── manifest.py          content hashing, per-stage run manifests
├── tasks/               download + build the puzzle bank
├── runner/              prompt, OpenRouter client, parser, run loop
├── extractor/           claim schema, extraction prompt, extract loop
├── verifier/            handlers, Stockfish wrapper, plan resolution
└── scorer/              aggregation, bootstrap intervals, report
scripts/eval_extractor.py   recall/precision against a labelled set
tests/                   handlers, tasks, parsing, frozen prompts, scoring
data/                    the bank, the stage outputs, the manifests
AUDIT.md                 what this repo was before, and what was reused
```

Every stage writes a manifest to `data/manifests/` naming its inputs by hash,
so any number in RESULTS.md traces back to the bank, the prompt text and the
engine build that produced it.

## Prompts are frozen

The runner and extractor prompts are content-hashed and their hashes are
asserted by tests. Rewording one makes every previously published number
incomparable, so changing the instrument fails the build rather than showing up
later as an unexplained shift in the results. To change a prompt, add `v2`
beside `v1` rather than editing `v1`.

## Stack

Python 3.12 · [uv](https://docs.astral.sh/uv/) ·
[python-chess](https://python-chess.readthedocs.io) ·
[Stockfish](https://stockfishchess.org) · httpx ·
[OpenRouter](https://openrouter.ai) · JSONL
