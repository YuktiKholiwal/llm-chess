# Chess reasoning eval — results

Models solve Lichess puzzles and write out their reasoning. Every factual claim
in that reasoning is extracted and checked against python-chess and Stockfish.
The number this eval exists to produce is the **gap** between how often a model
picks the right move and how often the things it says about the position are
true.

Run 2026-09-08T18:47:59+00:00 at commit `040532b-dirty` · 200 puzzles per model ·
Stockfish depth 20 · total spend $24.38.

## Headline

| Model | Solve rate | Claim accuracy | Gap | Unverifiable | Sound plans | Consistency | Plans naming a move | $/task |
|---|---|---|---|---|---|---|---|---|
| GPT-5.2 | 57.0% | 57.8% | -0.8 | 20.9% | 42.9% | 42.9% | 14.0% | $0.0575 |
| Qwen3.8 A95B | 33.0% | 40.0% | -7.0 | 17.0% | 31.7% | 98.6% | 81.0% | $0.0274 |
| Claude Sonnet 5 | 26.5% | 51.8% | -25.3 | 26.5% | 31.4% | 92.9% | 35.0% | $0.0370 |

*Gap is solve rate minus claim accuracy, in points. Positive means a model
picks better moves than its description of the position would justify; negative
means its reasoning is sounder than its move choice.*

**Read the last three columns together.** Consistency asks whether the stated
plan's move is the move actually played — but where a plan does not name its
move, a model has to infer one, and the resolver's mistakes then read as the
model contradicting itself. The "plans naming a move" column is that confound,
measured: a model at 14% is having most of its plans guessed at, and its
consistency figure is not comparable with one at 81%.

Sound plans replaces a median centipawn loss, which is the wrong summary here.
On tactical puzzles the distribution is bimodal — a plan finds the tactic or
throws the game away — so the median falls in a gap where almost no plan
actually lands. Across this run, 26% of plans lost 100cp or less and 53% lost
1000cp or more. `plan_cp_loss_median` is still in results.json for anyone who
wants it.

## Kill check

Claim accuracy spans **17.8 points**, from 40.0% (Qwen3.8 A95B) to 57.8% (GPT-5.2). That clears the 5-point kill-check threshold. Confidence intervals still overlap for GPT-5.2 and Claude Sonnet 5 — the data does not separate those pairs, whatever the point estimates suggest.

## How much evidence is behind each number

| Model | Claims/task | True | False | Unverifiable | Claim accuracy 95% CI | Solve rate 95% CI |
|---|---|---|---|---|---|---|
| GPT-5.2 | 6.6 | 601 | 438 | 275 | [54.2%, 61.5%] | [50.0%, 64.0%] |
| Qwen3.8 A95B (170/200 verified) | 7.2 | 477 | 715 | 245 | [36.1%, 44.0%] | [27.0%, 39.5%] |
| Claude Sonnet 5 | 5.0 | 384 | 358 | 268 | [47.4%, 55.9%] | [20.5%, 32.5%] |

Claim accuracy is true / (true + false); unverifiable claims are excluded from
it and reported separately. This is worth reading carefully, because the metric
rewards vagueness: a model that hedges everything into unverifiable prose can
score well on a very small denominator. Read claim accuracy together with
claims-per-task and the unverifiable rate, never alone.

Intervals are 95% percentile bootstraps over 2000 resamples. They resample
whole tasks rather than individual claims, because claims from one trace are
correlated — a model that misreads a position is usually wrong about it several
times over — and resampling claims independently would report an interval far
narrower than the evidence supports.

## State claims against line claims

A state claim is a fact about the position as it stands ("the knight on f6 is
pinned"). A line claim is a calculated variation ("if Qxc4, Nxc4 wins the queen
for a rook"). They are different abilities, and a single accuracy figure hides
which one a model actually has.

| Model | Overall | State claims | Line claims |
|---|---|---|---|
| GPT-5.2 | 57.8% (n=1039) | 67.3% (n=251) | 55.9% (n=655) |
| Qwen3.8 A95B | 40.0% (n=1192) | 86.4% (n=257) | 28.1% (n=823) |
| Claude Sonnet 5 | 51.8% (n=742) | 74.8% (n=262) | 40.4% (n=438) |

Line-claim accuracy spans 27.8 points (28.1% Qwen3.8 A95B to 55.9% GPT-5.2) and **separates the three models** — the spread clears 5 points and no intervals overlap.

State-claim accuracy spans 19.1 points (67.3% GPT-5.2 to 86.4% Qwen3.8 A95B) and **does not separate the three models** — intervals overlap for Qwen3.8 A95B/Claude Sonnet 5, Claude Sonnet 5/GPT-5.2.

## Extraction before and after

| Model | Unverifiable v1 | Unverifiable v2 | Claim accuracy v1 | Claim accuracy v2 |
|---|---|---|---|---|
| GPT-5.2 | 75.7% | 20.9% | 65.9% | 57.8% |
| Qwen3.8 A95B | 70.8% | 17.0% | 62.2% | 40.0% |
| Claude Sonnet 5 | 72.1% | 26.5% | 66.1% | 51.8% |

v1 of the extractor left roughly three quarters of claims unstructured, so
almost everything a model calculated went unchecked. v2 requires a structured
form for every claim and adds a `line` type for conditional variations. The
claims are the same reasoning traces in both rows — only the extraction and
verification changed.

## By rating band

| Band | Model | n | Solve rate | Claim accuracy | Gap |
|---|---|---|---|---|---|
| 1200 | GPT-5.2 | 50 | 84.0% | 68.2% | +15.8 |
| 1200 | Qwen3.8 A95B | 50 | 44.0% | 39.7% | +4.3 |
| 1200 | Claude Sonnet 5 | 50 | 26.0% | 55.8% | -29.8 |
| 1600 | GPT-5.2 | 50 | 52.0% | 55.3% | -3.3 |
| 1600 | Claude Sonnet 5 | 50 | 28.0% | 53.2% | -25.2 |
| 1600 | Qwen3.8 A95B | 50 | 28.0% | 50.0% | -22.0 |
| 2000 | GPT-5.2 | 50 | 52.0% | 53.4% | -1.4 |
| 2000 | Qwen3.8 A95B | 50 | 28.0% | 34.3% | -6.3 |
| 2000 | Claude Sonnet 5 | 50 | 24.0% | 48.0% | -24.0 |
| 2400 | GPT-5.2 | 50 | 40.0% | 53.5% | -13.5 |
| 2400 | Qwen3.8 A95B | 50 | 32.0% | 36.9% | -4.9 |
| 2400 | Claude Sonnet 5 | 50 | 28.0% | 50.0% | -22.0 |

## By motif

| Theme | Model | n | Solve rate | Claim accuracy | Gap |
|---|---|---|---|---|---|
| advancedPawn | GPT-5.2 | 20 | 85.0% | 55.8% | +29.2 |
| advancedPawn | Qwen3.8 A95B | 20 | 70.0% | 48.2% | +21.8 |
| advancedPawn | Claude Sonnet 5 | 20 | 45.0% | 53.5% | -8.5 |
| advantage | GPT-5.2 | 70 | 52.9% | 53.3% | -0.4 |
| advantage | Qwen3.8 A95B | 70 | 28.6% | 42.7% | -14.1 |
| advantage | Claude Sonnet 5 | 70 | 27.1% | 52.6% | -25.4 |
| attraction | GPT-5.2 | 15 | 60.0% | 56.1% | +3.9 |
| attraction | Qwen3.8 A95B | 15 | 46.7% | 46.5% | +0.2 |
| attraction | Claude Sonnet 5 | 15 | 20.0% | 36.8% | -16.8 |
| crushing | GPT-5.2 | 96 | 53.1% | 55.4% | -2.3 |
| crushing | Qwen3.8 A95B | 96 | 33.3% | 37.5% | -4.1 |
| crushing | Claude Sonnet 5 | 96 | 29.2% | 51.6% | -22.5 |
| defensiveMove | GPT-5.2 | 20 | 55.0% | 51.5% | +3.5 |
| defensiveMove | Qwen3.8 A95B | 20 | 40.0% | 40.0% | +0.0 |
| defensiveMove | Claude Sonnet 5 | 20 | 15.0% | 47.4% | -32.4 |
| deflection | GPT-5.2 | 13 | 61.5% | 52.1% | +9.5 |
| deflection | Qwen3.8 A95B | 13 | 46.2% | 35.7% | +10.4 |
| deflection | Claude Sonnet 5 | 13 | 30.8% | 30.8% | +0.0 |
| endgame | GPT-5.2 | 109 | 58.7% | 57.6% | +1.1 |
| endgame | Qwen3.8 A95B | 109 | 35.8% | 39.6% | -3.9 |
| endgame | Claude Sonnet 5 | 109 | 30.3% | 50.1% | -19.9 |
| exposedKing | GPT-5.2 | 12 | 41.7% | 58.3% | -16.7 |
| exposedKing | Qwen3.8 A95B | 12 | 41.7% | 37.8% | +3.8 |
| exposedKing | Claude Sonnet 5 | 12 | 16.7% | 53.2% | -36.5 |
| fork | GPT-5.2 | 26 | 46.2% | 49.2% | -3.0 |
| fork | Claude Sonnet 5 | 26 | 19.2% | 50.0% | -30.8 |
| fork | Qwen3.8 A95B | 26 | 19.2% | 33.1% | -13.9 |
| kingsideAttack | GPT-5.2 | 13 | 69.2% | 66.7% | +2.6 |
| kingsideAttack | Qwen3.8 A95B | 13 | 53.8% | 44.9% | +8.9 |
| kingsideAttack | Claude Sonnet 5 | 13 | 23.1% | 47.4% | -24.3 |
| long | GPT-5.2 | 84 | 42.9% | 54.1% | -11.3 |
| long | Qwen3.8 A95B | 84 | 32.1% | 41.5% | -9.4 |
| long | Claude Sonnet 5 | 84 | 22.6% | 52.2% | -29.6 |
| master | GPT-5.2 | 27 | 59.3% | 52.2% | +7.1 |
| master | Qwen3.8 A95B | 27 | 37.0% | 29.1% | +8.0 |
| master | Claude Sonnet 5 | 27 | 25.9% | 52.9% | -27.0 |
| mate | GPT-5.2 | 33 | 78.8% | 73.7% | +5.1 |
| mate | Qwen3.8 A95B | 33 | 42.4% | 41.6% | +0.8 |
| mate | Claude Sonnet 5 | 33 | 15.2% | 51.1% | -36.0 |
| mateIn2 | GPT-5.2 | 18 | 94.4% | 79.6% | +14.8 |
| mateIn2 | Qwen3.8 A95B | 18 | 33.3% | 35.2% | -1.9 |
| mateIn2 | Claude Sonnet 5 | 18 | 11.1% | 48.6% | -37.5 |
| middlegame | GPT-5.2 | 82 | 53.7% | 57.0% | -3.3 |
| middlegame | Qwen3.8 A95B | 82 | 30.5% | 39.1% | -8.6 |
| middlegame | Claude Sonnet 5 | 82 | 23.2% | 54.3% | -31.1 |
| pawnEndgame | GPT-5.2 | 15 | 60.0% | 58.0% | +2.0 |
| pawnEndgame | Qwen3.8 A95B | 15 | 40.0% | 42.6% | -2.6 |
| pawnEndgame | Claude Sonnet 5 | 15 | 26.7% | 40.0% | -13.3 |
| pin | GPT-5.2 | 13 | 30.8% | 56.5% | -25.7 |
| pin | Qwen3.8 A95B | 13 | 30.8% | 35.5% | -4.7 |
| pin | Claude Sonnet 5 | 13 | 15.4% | 53.5% | -38.1 |
| sacrifice | GPT-5.2 | 23 | 60.9% | 48.7% | +12.2 |
| sacrifice | Qwen3.8 A95B | 23 | 30.4% | 51.7% | -21.3 |
| sacrifice | Claude Sonnet 5 | 23 | 8.7% | 43.4% | -34.7 |
| short | GPT-5.2 | 85 | 67.1% | 61.2% | +5.8 |
| short | Claude Sonnet 5 | 85 | 28.2% | 53.0% | -24.8 |
| short | Qwen3.8 A95B | 85 | 28.2% | 36.5% | -8.3 |
| veryLong | GPT-5.2 | 25 | 64.0% | 52.7% | +11.3 |
| veryLong | Qwen3.8 A95B | 25 | 52.0% | 43.7% | +8.3 |
| veryLong | Claude Sonnet 5 | 25 | 32.0% | 45.1% | -13.1 |

Only motifs appearing in at least 10 tasks are shown; below that a row is noise
dressed up as a finding.

## What this does not measure

**Contamination is not controlled.** The Lichess puzzle export carries no
puzzle creation date — its only date column marks the day a puzzle was featured
as the daily puzzle, and is absent for almost all of them — so the intended
"created after 2026-06-01" filter had nothing to filter on. These puzzles may
well appear in training data. Nothing here separates recall from reasoning.

**Claim extraction is a model, not an oracle.** Claims are extracted by
Claude Haiku 4.5, and a claim it fails to extract is one the model is
never held to. `scripts/eval_extractor.py` measures recall and precision
against a hand-labelled set; until that set is labelled, the extractor's own
error rate is unmeasured and is not included in any interval above.

**Plan scoring depends on resolving a sentence to a move.** Where a plan names
its move, that move is read from the text. Where it does not, a model call
resolves it, and plans that resolve to nothing are excluded rather than
assumed. The share that resolved at all is reported as part of the run.
