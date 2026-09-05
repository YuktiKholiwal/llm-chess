"""Decides each claim's verdict and writes verified.jsonl.

State and threat claims go to the handlers; plan claims go to Stockfish, which
scores the move the plan implies. Everything else is unverifiable, and so is
anything the extractor could not pin down -- that bucket is reported rather
than hidden, because a model whose reasoning cannot be checked has told you
something real about that reasoning.

Every run gets at least one row even when it produced no claims at all. Without
that, a model whose reasoning was unreadable would simply disappear from the
cp-loss and consistency figures instead of being counted.
"""

from __future__ import annotations

import argparse
import sys
import threading
from concurrent.futures import ThreadPoolExecutor
from typing import Any

import chess

from ..config import CLAIMS_PATH, RUNS_PATH, TASKS_PATH, VERIFIED_PATH, Config, api_key
from ..manifest import write_manifest
from ..runner.client import make_client
from ..store import append_jsonl, read_jsonl, write_jsonl
from . import plans
from .handlers import verdict_for
from .engine import Engine

VERIFIABLE_TYPES = ("state", "threat")


def verify_claim(board: chess.Board, claim: dict, engine: Engine) -> bool | None:
    if claim["type"] not in VERIFIABLE_TYPES:
        return None
    return verdict_for(board, claim.get("structured"), engine)


def run(cfg: Config, args: argparse.Namespace) -> None:
    tasks = {task["id"]: task for task in read_jsonl(TASKS_PATH)}
    runs = {
        (row["task_id"], row["model"]): row
        for row in read_jsonl(RUNS_PATH)
        if row["task_id"] in tasks
    }
    if not runs:
        raise SystemExit(f"no rows in {RUNS_PATH}; run --stage run first")

    claims_by_run: dict[tuple[str, str], list[dict]] = {}
    for claim in read_jsonl(CLAIMS_PATH):
        key = (claim["task_id"], claim["model"])
        if key in runs:
            claims_by_run.setdefault(key, []).append(claim)

    existing = read_jsonl(VERIFIED_PATH)
    if args.force:
        selected = {spec.id for spec in cfg.models}
        existing = [row for row in existing if row["model"] not in selected]
        write_jsonl(VERIFIED_PATH, existing)

    done = {(row["task_id"], row["model"]) for row in existing}
    work = [key for key in runs if key not in done]

    print(f"verify: {len(runs)} runs, {len(work)} to verify")
    if args.dry_run:
        print("--dry-run: no engine or model calls were made")
        return
    if not work:
        return

    engine = Engine(
        cfg.engine.path, cfg.engine.depth, cfg.engine.threads, cfg.engine.hash_mb
    )
    client = make_client(cfg.provider.base_url, api_key(cfg.provider))
    lock = threading.Lock()
    state = {"done": 0, "true": 0, "false": 0, "unverifiable": 0, "cost": 0.0}

    def one(key: tuple[str, str]) -> None:
        run_row = runs[key]
        task = tasks[run_row["task_id"]]
        board = chess.Board(task["fen"])

        played = run_row.get("move")
        played_move = None
        if played and run_row.get("legal"):
            try:
                candidate = chess.Move.from_uci(played)
                if candidate in board.legal_moves:
                    played_move = candidate
            except ValueError:
                played_move = None

        played_cp_loss = engine.cp_loss(board, played_move) if played_move else None

        # The <plan> the model wrote for the whole task, resolved once. The
        # scorer needs it to ask whether the plan and the move agreed.
        plan_move, cost = plans.resolve(client, cfg, board, run_row.get("plan") or "")
        plan_move_cp_loss = engine.cp_loss(board, plan_move) if plan_move else None

        base = {
            "task_id": run_row["task_id"],
            "model": run_row["model"],
            "played_move": played,
            "played_cp_loss": played_cp_loss,
            # The <plan> the model stated for the task as a whole, kept apart
            # from the per-claim figure below: the scorer needs the stated plan
            # for consistency, and the claim's own plan for cp loss.
            "plan_move": plan_move.uci() if plan_move else None,
            "plan_move_cp_loss": plan_move_cp_loss,
        }

        rows: list[dict[str, Any]] = []
        for claim in claims_by_run.get(key, []):
            verdict = verify_claim(board, claim, engine)
            # A plan claim is scored by how much the engine dislikes the move
            # it implies, not by a true/false verdict.
            claim_plan_cp_loss = None
            if claim["type"] == "plan":
                implied, extra = plans.resolve(client, cfg, board, claim["text"])
                cost += extra
                if implied is not None:
                    claim_plan_cp_loss = engine.cp_loss(board, implied)

            rows.append(
                {
                    **base,
                    "claim_id": claim["claim_id"],
                    "type": claim["type"],
                    "verdict": verdict,
                    "plan_cp_loss": claim_plan_cp_loss,
                }
            )

        if not rows:
            # Keeps a run with no extractable claims inside the denominators
            # for cost, cp loss and consistency.
            rows.append(
                {**base, "claim_id": -1, "type": "none", "verdict": None,
                 "plan_cp_loss": plan_move_cp_loss}
            )

        with lock:
            append_jsonl(VERIFIED_PATH, rows)
            state["done"] += 1
            state["cost"] += cost
            for row in rows:
                if row["verdict"] is True:
                    state["true"] += 1
                elif row["verdict"] is False:
                    state["false"] += 1
                else:
                    state["unverifiable"] += 1
            print(
                f"\r  {state['done']}/{len(work)}  true {state['true']}  "
                f"false {state['false']}  unverifiable {state['unverifiable']}",
                end="",
                file=sys.stderr,
            )

    # Stockfish is the bottleneck and is serialised behind one lock, so extra
    # threads here only overlap the plan-resolution calls.
    with ThreadPoolExecutor(max_workers=cfg.limits.concurrency) as pool:
        list(pool.map(one, work))
    client.close()
    engine.close()
    print("", file=sys.stderr)

    write_manifest(
        "verify",
        {
            "engine": engine.version,
            "depth": cfg.engine.depth,
            "resolver": cfg.extractor.id,
            "resolver_hash": plans.resolver_hash(),
            "runs": state["done"],
            "verdicts": {
                "true": state["true"],
                "false": state["false"],
                "unverifiable": state["unverifiable"],
            },
            "cost_usd": round(state["cost"], 4),
        },
    )
    print(
        f"verify: {state['true']} true, {state['false']} false, "
        f"{state['unverifiable']} unverifiable -> {VERIFIED_PATH}"
    )
