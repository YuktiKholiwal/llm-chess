"""Measures the extractor against a hand-labelled set.

    uv run python scripts/eval_extractor.py --seed 50   # add traces to label
    uv run python scripts/eval_extractor.py             # score against labels

The extractor sits between the model and the score, so an error in it looks
exactly like an error in the model. Recall matters most: a claim it fails to
extract is a claim the model is never held to, which flatters models whose
reasoning is hardest to parse. Precision matters because an invented claim gets
verified against the board and charged to the model as a mistake it never made.

Matching two claim lists is a judgement call, so the rule is stated rather than
buried: a predicted claim matches a labelled one when their structured forms
agree exactly, or -- when neither is structured -- when their types agree and
their wording overlaps by at least half. Matching is greedy and one-to-one, so
one prediction cannot cover two labels.
"""

from __future__ import annotations

import argparse
import json
import random
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from eval import config as config_mod  # noqa: E402
from eval.config import EXTRACTOR_EVAL_PATH, RUNS_PATH, TASKS_PATH, api_key  # noqa: E402
from eval.extractor import prompt  # noqa: E402
from eval.extractor.extract import normalise, parse_claims  # noqa: E402
from eval.runner.client import chat, make_client  # noqa: E402
from eval.store import append_jsonl, read_jsonl  # noqa: E402

TEXT_OVERLAP = 0.5


def tokens(text: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", text.lower()))


def canonical(structured) -> str | None:
    if not isinstance(structured, dict):
        return None
    return json.dumps(
        {k: v for k, v in sorted(structured.items()) if v is not None},
        sort_keys=True,
    )


def matches(predicted: dict, labelled: dict) -> bool:
    left, right = canonical(predicted.get("structured")), canonical(labelled.get("structured"))
    if left is not None or right is not None:
        return left == right

    if predicted.get("type") != labelled.get("type"):
        return False
    a, b = tokens(predicted.get("text", "")), tokens(labelled.get("text", ""))
    if not a or not b:
        return False
    return len(a & b) / len(a | b) >= TEXT_OVERLAP


def score_one(predicted: list[dict], labelled: list[dict]) -> tuple[int, int, int]:
    """Returns (matched, predicted, labelled) under greedy one-to-one matching."""
    unclaimed = list(labelled)
    matched = 0
    for claim in predicted:
        for i, gold in enumerate(unclaimed):
            if matches(claim, gold):
                matched += 1
                unclaimed.pop(i)
                break
    return matched, len(predicted), len(labelled)


def seed(count: int) -> None:
    """Appends unlabelled traces sampled from runs.jsonl, ready for labelling."""
    tasks = {task["id"]: task for task in read_jsonl(TASKS_PATH)}
    runs = [
        row
        for row in read_jsonl(RUNS_PATH)
        if row["task_id"] in tasks and (row.get("reasoning") or "").strip()
    ]
    if not runs:
        raise SystemExit(f"no usable traces in {RUNS_PATH}")

    already = {row.get("id") for row in read_jsonl(EXTRACTOR_EVAL_PATH)}
    rng = random.Random(20260905)
    rng.shuffle(runs)

    added = []
    for row in runs:
        row_id = f"{row['task_id']}::{row['model']}"
        if row_id in already:
            continue
        task = tasks[row["task_id"]]
        added.append(
            {
                "id": row_id,
                "task_id": row["task_id"],
                "model": row["model"],
                "fen": task["fen"],
                "side_to_move": task["side_to_move"],
                "labelled": False,
                "reasoning": row["reasoning"],
                "claims": [],
            }
        )
        if len(added) == count:
            break

    append_jsonl(EXTRACTOR_EVAL_PATH, added)
    print(f"added {len(added)} traces to {EXTRACTOR_EVAL_PATH}")
    print('Label each one by filling in "claims" and setting "labelled": true.')


def measure(config_path: str) -> None:
    cfg = config_mod.load(config_path)
    rows = [row for row in read_jsonl(EXTRACTOR_EVAL_PATH) if row.get("labelled")]
    if not rows:
        raise SystemExit(
            f"no labelled rows in {EXTRACTOR_EVAL_PATH}.\n"
            "Run with --seed N to add traces, then label them."
        )

    client = make_client(cfg.provider.base_url, api_key(cfg.provider))
    total_matched = total_predicted = total_labelled = 0
    type_right = type_total = 0

    for row in rows:
        result = chat(
            client,
            cfg.extractor,
            [
                {"role": "system", "content": prompt.SYSTEM},
                {
                    "role": "user",
                    "content": prompt.user(row["fen"], row["side_to_move"], row["reasoning"]),
                },
            ],
            cfg.limits,
        )
        raw = parse_claims(result.text) or []
        predicted = [normalise(item, i) for i, item in enumerate(raw)]

        matched, n_pred, n_gold = score_one(predicted, row["claims"])
        total_matched += matched
        total_predicted += n_pred
        total_labelled += n_gold

        # Type agreement over the claims that were found at all, which is the
        # only population where "did it label the type correctly" is answerable.
        for claim in predicted:
            for gold in row["claims"]:
                if matches(claim, gold):
                    type_total += 1
                    type_right += claim["type"] == gold["type"]
                    break

        print(f"  {row['id']:<44} matched {matched}/{n_gold}  predicted {n_pred}")

    client.close()

    precision = total_matched / total_predicted if total_predicted else 0.0
    recall = total_matched / total_labelled if total_labelled else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0

    print(f"\ntraces      {len(rows)}")
    print(f"labelled    {total_labelled} claims")
    print(f"predicted   {total_predicted} claims")
    print(f"precision   {precision:.3f}")
    print(f"recall      {recall:.3f}")
    print(f"f1          {f1:.3f}")
    if type_total:
        print(f"type match  {type_right / type_total:.3f}  (over {type_total} matched claims)")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", default="config/models.yaml")
    parser.add_argument(
        "--seed",
        type=int,
        default=0,
        help="append this many unlabelled traces from runs.jsonl instead of scoring",
    )
    args = parser.parse_args()

    if args.seed:
        seed(args.seed)
    else:
        measure(args.config)


if __name__ == "__main__":
    main()
