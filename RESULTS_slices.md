# Slices

Cut from cached data with `uv run python scripts/slices.py`. No model calls, no engine runs.

Every cell is claim accuracy — true / (true + false) — with the number of verifiable claims behind it. Unverifiable claims are excluded from both the numerator and the denominator, so `n` is smaller than the number of claims extracted.

## Claim accuracy by structured kind

| Kind | Claude Sonnet 5 | GPT-5.2 | Qwen3.8 A95B |
|---|---|---|---|
| attacked | 58.2% (n=98) | 35.7% (n=56) | 52.3% (n=130) |
| castling_rights | 100.0% (n=1) | — | 50.0% (n=2) |
| check | 86.8% (n=38) | 90.6% (n=96) | 74.7% (n=91) |
| controls_square | 58.1% (n=31) | 63.2% (n=68) | 50.0% (n=76) |
| defended | 70.2% (n=94) | 78.9% (n=71) | 56.8% (n=44) |
| hanging | 38.5% (n=13) | 41.7% (n=12) | 100.0% (n=1) |
| mate_in | 27.3% (n=11) | 28.1% (n=32) | 5.5% (n=73) |
| material | 0.0% (n=5) | 14.3% (n=7) | 21.4% (n=14) |
| passed_pawn | 66.7% (n=6) | 53.8% (n=13) | 75.0% (n=12) |
| piece_on_square | 96.9% (n=32) | 90.9% (n=33) | 98.2% (n=170) |
| pinned | 0.0% (n=1) | 20.0% (n=5) | 0.0% (n=4) |

## Claim accuracy by rating band

| Band | Claude Sonnet 5 | GPT-5.2 | Qwen3.8 A95B |
|---|---|---|---|
| 1200 | 72.3% (n=83) | 66.0% (n=144) | 64.5% (n=152) |
| 1600 | 58.2% (n=98) | 67.0% (n=91) | 64.5% (n=152) |
| 2000 | 68.6% (n=70) | 69.0% (n=71) | 65.8% (n=146) |
| 2400 | 67.1% (n=79) | 62.1% (n=87) | 55.1% (n=167) |

## Sound plans

A plan is sound when the move it implies loses less than 100 centipawns against the engine's best.

| Model | Sound plans | Plans scored |
|---|---|---|
| Claude Sonnet 5 | 17.3% | 173 |
| GPT-5.2 | 34.0% | 250 |
| Qwen3.8 A95B | 24.5% | 237 |
