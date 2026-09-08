"""Cuts the verified claims into slices, from cached data only.

    uv run python scripts/slices.py

Writes data/triage.csv (a sample of unverifiable claims, for hand-bucketing)
and RESULTS_slices.md (claim accuracy by structured kind, by rating band, and
the sound-plan share). Makes no model calls and runs no engine.
"""

from __future__ import annotations

import csv
import random
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from eval.config import CLAIMS_PATH, RUNS_PATH, TASKS_PATH, VERIFIED_PATH  # noqa: E402
from eval.store import read_jsonl  # noqa: E402

TRIAGE_PATH = Path("data/triage.csv")
SLICES_PATH = Path("RESULTS_slices.md")

TRIAGE_SAMPLE = 100
SOUND_PLAN_CP = 100
SEED = 20260905

MODEL_ORDER = [
    "anthropic/claude-sonnet-5",
    "openai/gpt-5.2",
    "qwen/qwen3.8-2.4t-a95b",
]
LABELS = {
    "anthropic/claude-sonnet-5": "Claude Sonnet 5",
    "openai/gpt-5.2": "GPT-5.2",
    "qwen/qwen3.8-2.4t-a95b": "Qwen3.8 A95B",
}
BANDS = [1200, 1600, 2000, 2400]


def load():
    tasks = {t["id"]: t for t in read_jsonl(TASKS_PATH)}
    claims = {(c["task_id"], c["model"], c["claim_id"]): c for c in read_jsonl(CLAIMS_PATH)}
    verdicts = [v for v in read_jsonl(VERIFIED_PATH) if v["claim_id"] >= 0]
    return tasks, claims, verdicts


def write_triage(tasks, claims, verdicts) -> int:
    """A seeded sample of unverifiable claims, drawn evenly across models.

    Never overwrites an existing file: the sample is hand-labelled, and a
    rerun after re-extraction would silently replace rows someone has already
    read and bucketed. Delete it deliberately to draw a fresh one.
    """
    if TRIAGE_PATH.exists():
        return sum(1 for _ in TRIAGE_PATH.open()) - 1
    unverifiable = defaultdict(list)
    for v in verdicts:
        if v["verdict"] is None:
            claim = claims.get((v["task_id"], v["model"], v["claim_id"]))
            if claim is not None:
                unverifiable[v["model"]].append(claim)

    rng = random.Random(SEED)
    models = [m for m in MODEL_ORDER if unverifiable[m]]
    per_model = TRIAGE_SAMPLE // len(models)
    remainder = TRIAGE_SAMPLE - per_model * len(models)

    sampled = []
    for i, model in enumerate(models):
        take = per_model + (1 if i < remainder else 0)
        pool = unverifiable[model]
        sampled.extend(rng.sample(pool, min(take, len(pool))))
    rng.shuffle(sampled)

    TRIAGE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with TRIAGE_PATH.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow(["model", "task_id", "claim_text", "claim_type", "fen", "bucket"])
        for claim in sampled:
            writer.writerow([
                claim["model"],
                claim["task_id"],
                claim["text"],
                claim["type"],
                tasks[claim["task_id"]]["fen"],
                "",
            ])
    return len(sampled)


def cell(true: int, false: int) -> str:
    total = true + false
    return "—" if total == 0 else f"{true / total * 100:.1f}% (n={total})"


def table(rows: dict, row_keys: list, heading: str, models: list) -> str:
    header = f"| {heading} | " + " | ".join(LABELS[m] for m in models) + " |"
    sep = "|---" * (len(models) + 1) + "|"
    lines = [header, sep]
    for key in row_keys:
        cells = [cell(*rows[(key, m)]) for m in models]
        lines.append(f"| {key} | " + " | ".join(cells) + " |")
    return "\n".join(lines)


def main() -> None:
    tasks, claims, verdicts = load()
    n_triage = write_triage(tasks, claims, verdicts)

    models = [m for m in MODEL_ORDER if any(v["model"] == m for v in verdicts)]

    by_kind: dict = defaultdict(lambda: [0, 0])
    by_band: dict = defaultdict(lambda: [0, 0])
    kinds: set[str] = set()

    for v in verdicts:
        if v["verdict"] is None:
            continue
        claim = claims.get((v["task_id"], v["model"], v["claim_id"]))
        if claim is None:
            continue
        index = 0 if v["verdict"] is True else 1

        structured = claim.get("structured")
        if structured:
            kind = structured["kind"]
            kinds.add(kind)
            by_kind[(kind, v["model"])][index] += 1

        band = tasks[v["task_id"]]["rating_band"]
        by_band[(band, v["model"])][index] += 1

    # One plan per task, carried on every row of that run, so dedupe by run.
    # Claim-level plan_cp_loss went away when claims became state/line/
    # best_move/unverifiable; the stated <plan> is where a plan lives now.
    sound: dict = defaultdict(lambda: [0, 0])
    seen: set[tuple[str, str]] = set()
    for v in read_jsonl(VERIFIED_PATH):
        key = (v["task_id"], v["model"])
        if key in seen:
            continue
        seen.add(key)
        loss = v.get("plan_move_cp_loss")
        if loss is not None:
            sound[v["model"]][0] += 1 if loss < SOUND_PLAN_CP else 0
            sound[v["model"]][1] += 1

    plan_lines = [
        "| Model | Sound plans | Plans scored |",
        "|---|---|---|",
    ]
    for model in models:
        hit, total = sound[model]
        share = f"{hit / total * 100:.1f}%" if total else "—"
        plan_lines.append(f"| {LABELS[model]} | {share} | {total} |")

    SLICES_PATH.write_text(
        "# Slices\n\n"
        "Cut from cached data with `uv run python scripts/slices.py`. No model "
        "calls, no engine runs.\n\n"
        "Every cell is claim accuracy — true / (true + false) — with the number "
        "of verifiable claims behind it. Unverifiable claims are excluded from "
        "both the numerator and the denominator, so `n` is smaller than the "
        "number of claims extracted.\n\n"
        "## Claim accuracy by structured kind\n\n"
        + table(by_kind, sorted(kinds), "Kind", models)
        + "\n\n## Claim accuracy by rating band\n\n"
        + table(by_band, BANDS, "Band", models)
        + f"\n\n## Sound plans\n\nA plan is sound when the move it implies loses "
        f"less than {SOUND_PLAN_CP} centipawns against the engine's best.\n\n"
        + "\n".join(plan_lines)
        + "\n",
        encoding="utf-8",
    )

    print(f"triage: {n_triage} unverifiable claims -> {TRIAGE_PATH}")
    print(f"slices: {len(kinds)} kinds, {len(BANDS)} bands -> {SLICES_PATH}")


if __name__ == "__main__":
    main()
