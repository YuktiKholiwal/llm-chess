"""Turns each reasoning trace into a list of atomic claims.

Reads runs.jsonl and writes claims.jsonl, keyed by (task_id, model) so the
stage is resumable and so the extractor can be rewritten and re-run without
touching the models. That is the point of splitting it out: extraction is the
part most likely to need several attempts, and it must not cost a re-query.

A trace that yields no parseable JSON is recorded as zero claims rather than
skipped. Skipping would quietly shrink the denominator for exactly the models
whose reasoning is hardest to read.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import threading
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from ..config import CLAIMS_PATH, RUNS_PATH, TASKS_PATH, Config, api_key
from ..manifest import write_manifest
from ..runner.client import chat, make_client
from ..store import append_jsonl, read_jsonl, write_jsonl
from . import prompt
from .schema import CLAIM_TYPES, is_well_formed

_FENCE = re.compile(r"```(?:json)?\s*(.*?)```", re.DOTALL)


def parse_claims(text: str) -> list[dict[str, Any]] | None:
    """The JSON array from the extractor's reply, or None if there isn't one.

    None and [] mean different things: None is "the extractor did not answer in
    the required form", [] is "this trace asserted nothing". Collapsing them
    would hide extractor failures inside a model's unverifiable rate.
    """
    candidates = [match.group(1) for match in _FENCE.finditer(text)]
    start, end = text.find("["), text.rfind("]")
    if start != -1 and end > start:
        candidates.append(text[start : end + 1])

    for candidate in candidates:
        try:
            parsed = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, list):
            return [item for item in parsed if isinstance(item, dict)]
    return None


def normalise(raw: dict[str, Any], claim_id: int) -> dict[str, Any]:
    claim_type = str(raw.get("type", "")).strip().lower()
    if claim_type not in CLAIM_TYPES:
        claim_type = "unverifiable"

    structured = raw.get("structured")
    if not is_well_formed(structured):
        structured = None
    # A plan is scored by Stockfish, not by a handler, so a structured form on
    # one would never be read; dropping it keeps the contract honest.
    if claim_type == "plan":
        structured = None

    return {
        "claim_id": claim_id,
        "text": str(raw.get("text", "")).strip(),
        "type": claim_type,
        "subject": str(raw.get("subject", "") or "").strip(),
        "structured": structured,
    }


def extract_one(client, cfg: Config, run_row: dict, task: dict) -> list[dict[str, Any]]:
    reasoning = (run_row.get("reasoning") or "").strip()
    base = {"task_id": run_row["task_id"], "model": run_row["model"]}

    if not reasoning:
        return []

    result = chat(
        client,
        cfg.extractor,
        [
            {"role": "system", "content": prompt.SYSTEM},
            {
                "role": "user",
                "content": prompt.user(task["fen"], task["side_to_move"], reasoning),
            },
        ],
        cfg.limits,
    )
    if result.error:
        raise RuntimeError(result.error)

    parsed = parse_claims(result.text)
    if parsed is None:
        # Recorded, not dropped: an unreadable extraction is a fact about this
        # trace and the scorer should be able to see how often it happened.
        return [
            {
                **base,
                "claim_id": 0,
                "text": "",
                "type": "unverifiable",
                "subject": "",
                "structured": None,
                "extraction_failed": True,
                "cost_usd": round(result.cost_usd, 6),
            }
        ]

    rows = [{**base, **normalise(raw, i)} for i, raw in enumerate(parsed)]
    if rows:
        rows[0]["cost_usd"] = round(result.cost_usd, 6)
    return rows


def run(cfg: Config, args: argparse.Namespace) -> None:
    tasks = {task["id"]: task for task in read_jsonl(TASKS_PATH)}
    runs = [row for row in read_jsonl(RUNS_PATH) if row["task_id"] in tasks]
    if not runs:
        raise SystemExit(f"no rows in {RUNS_PATH}; run --stage run first")

    existing = read_jsonl(CLAIMS_PATH)
    if args.force:
        selected = {spec.id for spec in cfg.models}
        existing = [row for row in existing if row["model"] not in selected]
        write_jsonl(CLAIMS_PATH, existing)

    done = {(row["task_id"], row["model"]) for row in existing}
    work = [row for row in runs if (row["task_id"], row["model"]) not in done]

    print(f"extract: {len(runs)} traces, {len(work)} to extract")
    if args.dry_run:
        print("--dry-run: nothing was sent")
        return
    if not work:
        return

    client = make_client(api_key())
    lock = threading.Lock()
    state = {"done": 0, "claims": 0, "cost": 0.0, "failures": 0, "stop": None}

    def one(run_row: dict) -> None:
        with lock:
            if state["stop"]:
                return
        try:
            rows = extract_one(client, cfg, run_row, tasks[run_row["task_id"]])
        except RuntimeError as err:
            with lock:
                state["failures"] += 1
                if state["failures"] >= cfg.limits.abort_after_consecutive_errors:
                    state["stop"] = str(err)
            return

        with lock:
            state["failures"] = 0
            append_jsonl(CLAIMS_PATH, rows)
            state["done"] += 1
            state["claims"] += sum(1 for r in rows if not r.get("extraction_failed"))
            state["cost"] += sum(r.get("cost_usd", 0.0) for r in rows)
            print(
                f"\r  {state['done']}/{len(work)}  claims {state['claims']}  "
                f"${state['cost']:.2f}",
                end="",
                file=sys.stderr,
            )

    with ThreadPoolExecutor(max_workers=cfg.limits.concurrency) as pool:
        list(pool.map(one, work))
    client.close()
    print("", file=sys.stderr)

    if state["stop"]:
        raise SystemExit(
            f"extractor aborted after repeated failures: {state['stop']}\n"
            "Nothing is scored from a partial extraction."
        )

    write_manifest(
        "extract",
        {
            "extractor": cfg.extractor.id,
            "prompt": {"version": prompt.PROMPT_VERSION, "hash": prompt.prompt_hash()},
            "traces": state["done"],
            "claims": state["claims"],
            "cost_usd": round(state["cost"], 4),
        },
    )
    print(f"extract: {state['claims']} claims from {state['done']} traces -> {CLAIMS_PATH}")
