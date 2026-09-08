# Slices

Cut from cached data with `uv run python scripts/slices.py`. No model calls, no engine runs.

Every cell is claim accuracy — true / (true + false) — with the number of verifiable claims behind it. Unverifiable claims are excluded from both the numerator and the denominator, so `n` is smaller than the number of claims extracted.

## Claim accuracy by structured kind

| Kind | Claude Sonnet 5 | GPT-5.2 | Qwen3.8 A95B |
|---|---|---|---|
| attacked | 77.9% (n=86) | 57.6% (n=59) | 72.1% (n=43) |
| best_move | 26.2% (n=42) | 49.6% (n=133) | 21.4% (n=112) |
| castling_rights | 100.0% (n=1) | 50.0% (n=2) | 50.0% (n=2) |
| check | 71.4% (n=7) | 70.0% (n=10) | 57.1% (n=7) |
| controls_square | 60.0% (n=35) | 64.3% (n=70) | 71.9% (n=32) |
| defended | 71.0% (n=93) | 84.9% (n=53) | 68.8% (n=16) |
| hanging | 100.0% (n=1) | 50.0% (n=8) | — |
| line | 40.4% (n=438) | 55.9% (n=656) | 28.1% (n=823) |
| mate_in | — | 100.0% (n=1) | 100.0% (n=1) |
| material | 0.0% (n=3) | 22.2% (n=9) | 60.0% (n=5) |
| passed_pawn | 100.0% (n=4) | 88.9% (n=9) | 91.7% (n=12) |
| piece_on_square | 100.0% (n=31) | 87.0% (n=23) | 98.6% (n=139) |
| pinned | 0.0% (n=1) | 16.7% (n=6) | — |

## Claim accuracy by rating band

| Band | Claude Sonnet 5 | GPT-5.2 | Qwen3.8 A95B |
|---|---|---|---|
| 1200 | 55.8% (n=181) | 68.2% (n=277) | 39.7% (n=343) |
| 1600 | 53.2% (n=190) | 55.3% (n=253) | 50.0% (n=274) |
| 2000 | 48.0% (n=179) | 53.4% (n=264) | 34.3% (n=315) |
| 2400 | 50.0% (n=192) | 53.5% (n=245) | 36.9% (n=260) |

## Sound plans

A plan is sound when the move it implies loses less than 100 centipawns against the engine's best.

| Model | Sound plans | Plans scored |
|---|---|---|
| Claude Sonnet 5 | 31.4% | 70 |
| GPT-5.2 | 42.9% | 28 |
| Qwen3.8 A95B | 31.7% | 139 |
