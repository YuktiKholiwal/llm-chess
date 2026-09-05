# Chess reasoning eval — results

Models solve Lichess puzzles and write out their reasoning. Every factual claim
in that reasoning is extracted and checked against python-chess and Stockfish.
The number this eval exists to produce is the **gap** between how often a model
picks the right move and how often the things it says about the position are
true.

Run 2026-09-05T21:19:28+00:00 at commit `bc2ba00-dirty` · 200 puzzles per model ·
Stockfish depth 20 · total spend $24.38.

## Headline

| Model | Solve rate | Claim accuracy | Gap | Unverifiable | Sound plans | Consistency | Plans naming a move | $/task |
|---|---|---|---|---|---|---|---|---|
| GPT-5.2 | 57.0% | 65.9% | -8.9 | 75.7% | 34.0% | 50.0% | 14.0% | $0.0575 |
| Qwen3.8 A95B | 33.0% | 62.2% | -29.2 | 70.8% | 24.5% | 98.4% | 81.0% | $0.0274 |
| Claude Sonnet 5 | 26.5% | 66.1% | -39.6 | 72.1% | 17.3% | 86.0% | 35.0% | $0.0370 |

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

Claim accuracy spans **3.8 points**, from 62.2% (Qwen3.8 A95B) to 66.1% (Claude Sonnet 5). **That is within the 5-point kill-check threshold. The eval is not discriminative yet and needs rethinking before anything is added to it.** Confidence intervals still overlap for Claude Sonnet 5 and GPT-5.2; Claude Sonnet 5 and Qwen3.8 A95B; GPT-5.2 and Qwen3.8 A95B — the data does not separate those pairs, whatever the point estimates suggest.

## How much evidence is behind each number

| Model | Claims/task | True | False | Unverifiable | Claim accuracy 95% CI | Solve rate 95% CI |
|---|---|---|---|---|---|---|
| GPT-5.2 | 8.1 | 259 | 134 | 1227 | [61.5%, 70.6%] | [50.0%, 64.0%] |
| Qwen3.8 A95B | 10.6 | 384 | 233 | 1497 | [57.5%, 67.1%] | [27.0%, 39.5%] |
| Claude Sonnet 5 | 5.9 | 218 | 112 | 852 | [60.4%, 71.7%] | [20.5%, 32.5%] |

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

## By rating band

| Band | Model | n | Solve rate | Claim accuracy | Gap |
|---|---|---|---|---|---|
| 1200 | GPT-5.2 | 50 | 84.0% | 66.0% | +18.0 |
| 1200 | Qwen3.8 A95B | 50 | 44.0% | 64.5% | -20.5 |
| 1200 | Claude Sonnet 5 | 50 | 26.0% | 72.3% | -46.3 |
| 1600 | GPT-5.2 | 50 | 52.0% | 67.0% | -15.0 |
| 1600 | Claude Sonnet 5 | 50 | 28.0% | 58.2% | -30.2 |
| 1600 | Qwen3.8 A95B | 50 | 28.0% | 64.5% | -36.5 |
| 2000 | GPT-5.2 | 50 | 52.0% | 69.0% | -17.0 |
| 2000 | Qwen3.8 A95B | 50 | 28.0% | 65.8% | -37.8 |
| 2000 | Claude Sonnet 5 | 50 | 24.0% | 68.6% | -44.6 |
| 2400 | GPT-5.2 | 50 | 40.0% | 62.1% | -22.1 |
| 2400 | Qwen3.8 A95B | 50 | 32.0% | 55.1% | -23.1 |
| 2400 | Claude Sonnet 5 | 50 | 28.0% | 67.1% | -39.1 |

## By motif

| Theme | Model | n | Solve rate | Claim accuracy | Gap |
|---|---|---|---|---|---|
| advancedPawn | GPT-5.2 | 20 | 85.0% | 52.2% | +32.8 |
| advancedPawn | Qwen3.8 A95B | 20 | 70.0% | 79.6% | -9.6 |
| advancedPawn | Claude Sonnet 5 | 20 | 45.0% | 66.7% | -21.7 |
| advantage | GPT-5.2 | 70 | 52.9% | 63.5% | -10.6 |
| advantage | Qwen3.8 A95B | 70 | 28.6% | 64.7% | -36.2 |
| advantage | Claude Sonnet 5 | 70 | 27.1% | 74.1% | -46.9 |
| attraction | GPT-5.2 | 15 | 60.0% | 55.6% | +4.4 |
| attraction | Qwen3.8 A95B | 15 | 46.7% | 76.0% | -29.3 |
| attraction | Claude Sonnet 5 | 15 | 20.0% | 62.5% | -42.5 |
| crushing | GPT-5.2 | 96 | 53.1% | 67.1% | -14.0 |
| crushing | Qwen3.8 A95B | 96 | 33.3% | 57.0% | -23.6 |
| crushing | Claude Sonnet 5 | 96 | 29.2% | 63.3% | -34.2 |
| defensiveMove | GPT-5.2 | 20 | 55.0% | 64.7% | -9.7 |
| defensiveMove | Qwen3.8 A95B | 20 | 40.0% | 69.8% | -29.8 |
| defensiveMove | Claude Sonnet 5 | 20 | 15.0% | 65.4% | -50.4 |
| deflection | GPT-5.2 | 13 | 61.5% | 63.3% | -1.8 |
| deflection | Qwen3.8 A95B | 13 | 46.2% | 54.8% | -8.6 |
| deflection | Claude Sonnet 5 | 13 | 30.8% | 61.9% | -31.1 |
| endgame | GPT-5.2 | 109 | 58.7% | 66.2% | -7.5 |
| endgame | Qwen3.8 A95B | 109 | 35.8% | 63.4% | -27.7 |
| endgame | Claude Sonnet 5 | 109 | 30.3% | 68.1% | -37.9 |
| exposedKing | GPT-5.2 | 12 | 41.7% | 81.2% | -39.6 |
| exposedKing | Qwen3.8 A95B | 12 | 41.7% | 60.9% | -19.2 |
| exposedKing | Claude Sonnet 5 | 12 | 16.7% | 60.0% | -43.3 |
| fork | GPT-5.2 | 26 | 46.2% | 67.5% | -21.3 |
| fork | Claude Sonnet 5 | 26 | 19.2% | 65.9% | -46.7 |
| fork | Qwen3.8 A95B | 26 | 19.2% | 57.1% | -37.9 |
| kingsideAttack | GPT-5.2 | 13 | 69.2% | 57.1% | +12.1 |
| kingsideAttack | Qwen3.8 A95B | 13 | 53.8% | 58.1% | -4.2 |
| kingsideAttack | Claude Sonnet 5 | 13 | 23.1% | 58.3% | -35.3 |
| long | GPT-5.2 | 84 | 42.9% | 62.5% | -19.6 |
| long | Qwen3.8 A95B | 84 | 32.1% | 57.8% | -25.7 |
| long | Claude Sonnet 5 | 84 | 22.6% | 69.9% | -47.2 |
| master | GPT-5.2 | 27 | 59.3% | 67.3% | -8.1 |
| master | Qwen3.8 A95B | 27 | 37.0% | 59.7% | -22.7 |
| master | Claude Sonnet 5 | 27 | 25.9% | 64.3% | -38.4 |
| mate | GPT-5.2 | 33 | 78.8% | 66.2% | +12.6 |
| mate | Qwen3.8 A95B | 33 | 42.4% | 67.5% | -25.1 |
| mate | Claude Sonnet 5 | 33 | 15.2% | 59.2% | -44.0 |
| mateIn2 | GPT-5.2 | 18 | 94.4% | 64.8% | +29.7 |
| mateIn2 | Qwen3.8 A95B | 18 | 33.3% | 61.4% | -28.1 |
| mateIn2 | Claude Sonnet 5 | 18 | 11.1% | 53.8% | -42.7 |
| middlegame | GPT-5.2 | 82 | 53.7% | 65.0% | -11.3 |
| middlegame | Qwen3.8 A95B | 82 | 30.5% | 59.8% | -29.3 |
| middlegame | Claude Sonnet 5 | 82 | 23.2% | 65.4% | -42.2 |
| pawnEndgame | GPT-5.2 | 15 | 60.0% | 68.2% | -8.2 |
| pawnEndgame | Qwen3.8 A95B | 15 | 40.0% | 86.4% | -46.4 |
| pawnEndgame | Claude Sonnet 5 | 15 | 26.7% | 50.0% | -23.3 |
| pin | GPT-5.2 | 13 | 30.8% | 70.0% | -39.2 |
| pin | Qwen3.8 A95B | 13 | 30.8% | 51.4% | -20.6 |
| pin | Claude Sonnet 5 | 13 | 15.4% | 65.4% | -50.0 |
| sacrifice | GPT-5.2 | 23 | 60.9% | 55.3% | +5.6 |
| sacrifice | Qwen3.8 A95B | 23 | 30.4% | 66.3% | -35.8 |
| sacrifice | Claude Sonnet 5 | 23 | 8.7% | 66.7% | -58.0 |
| short | GPT-5.2 | 85 | 67.1% | 67.2% | -0.1 |
| short | Claude Sonnet 5 | 85 | 28.2% | 61.5% | -33.3 |
| short | Qwen3.8 A95B | 85 | 28.2% | 59.1% | -30.9 |
| veryLong | GPT-5.2 | 25 | 64.0% | 63.6% | +0.4 |
| veryLong | Qwen3.8 A95B | 25 | 52.0% | 74.4% | -22.4 |
| veryLong | Claude Sonnet 5 | 25 | 32.0% | 67.7% | -35.7 |

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
