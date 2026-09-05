"""Queries every model over every task and records what came back.

Results are cached by (task_id, model), so a rerun asks only for what is
missing. That is what makes the expensive stage payable once: the extractor and
the scorer can be rewritten and re-run against this file indefinitely without
another request.

Requests run concurrently because the alternative is hours of waiting on
network latency. The cost ceiling is checked before each request is submitted,
so a run can overshoot by at most the calls already in flight -- bounded, and
worth stating rather than implying the cap is exact.
"""

from __future__ import annotations

import argparse
import sys
import threading
from concurrent.futures import ThreadPoolExecutor
from typing import Any

import chess
import httpx

from ..config import RUNS_PATH, TASKS_PATH, Config, ModelSpec, api_key
from ..manifest import write_manifest
from ..store import append_jsonl, read_jsonl, write_jsonl
from . import prompt
from .client import ChatResult, chat, make_client
from .parse import parse

# The spec allows one retry after an illegal move, so at most two attempts.
MAX_ATTEMPTS = 2


class Budget:
    """Shared spend ceiling and consecutive-failure tripwire.

    The tripwire exists because an unreachable API is not a model scoring zero.
    Recording it as one would put a number in RESULTS.md that describes the
    network rather than the model, so the run stops instead.
    """

    def __init__(self, limit_usd: float, abort_after: int) -> None:
        self._lock = threading.Lock()
        self._spent = 0.0
        self._consecutive = 0
        self.limit_usd = limit_usd
        self.abort_after = abort_after
        self.stopped: str | None = None

    @property
    def spent(self) -> float:
        with self._lock:
            return self._spent

    def claim(self) -> bool:
        """True if another request may start."""
        with self._lock:
            if self.stopped:
                return False
            if self._spent >= self.limit_usd:
                self.stopped = f"cost cap ${self.limit_usd:.2f} reached"
                return False
            return True

    def record(self, cost: float, failed: bool) -> None:
        with self._lock:
            self._spent += cost
            self._consecutive = self._consecutive + 1 if failed else 0
            if self._consecutive >= self.abort_after and not self.stopped:
                self.stopped = (
                    f"{self._consecutive} consecutive request failures; "
                    "scoring these as model failures would be wrong"
                )


def stratified(tasks: list[dict[str, Any]], limit: int = 0) -> list[dict[str, Any]]:
    """Orders tasks round-robin across rating bands, optionally truncated.

    The bank is stored band by band, so any prefix of it is all easy puzzles.
    Ordering this way means a `--limit 12` smoke run spans every band -- and,
    more importantly, that a run cut short partway through still leaves a
    balanced sample rather than one weighted to the bands that happen to sort
    first.
    """
    bands: dict[Any, list[dict[str, Any]]] = {}
    for task in tasks:
        bands.setdefault(task["rating_band"], []).append(task)

    out: list[dict[str, Any]] = []
    depth = 0
    while True:
        added = False
        for band in sorted(bands):
            if depth < len(bands[band]):
                out.append(bands[band][depth])
                added = True
        if not added:
            break
        depth += 1
    return out[:limit] if limit > 0 else out


def ask(
    client: httpx.Client,
    spec: ModelSpec,
    task: dict[str, Any],
    cfg: Config,
) -> dict[str, Any]:
    board = chess.Board(task["fen"])
    messages = [
        {"role": "system", "content": prompt.SYSTEM},
        {"role": "user", "content": prompt.position(task["fen"])},
    ]

    tokens_in = tokens_out = 0
    cost = 0.0
    latency = 0
    last: ChatResult | None = None
    parsed = None

    for attempt in range(MAX_ATTEMPTS):
        last = chat(client, spec, messages, cfg.limits)
        tokens_in += last.tokens_in
        tokens_out += last.tokens_out
        cost += last.cost_usd
        latency += last.latency_ms

        if last.error:
            return _row(task, spec, None, None, tokens_in, tokens_out, cost, latency,
                        retries=attempt, error=last.error)

        parsed = parse(last.text)
        if parsed.move:
            try:
                if chess.Move.from_uci(parsed.move) in board.legal_moves:
                    return _row(task, spec, parsed, last, tokens_in, tokens_out, cost,
                                latency, retries=attempt, legal=True)
            except ValueError:
                pass

        if attempt + 1 < MAX_ATTEMPTS:
            messages.append({"role": "assistant", "content": last.text})
            messages.append({"role": "user", "content": prompt.retry(task["fen"])})

    return _row(task, spec, parsed, last, tokens_in, tokens_out, cost, latency,
                retries=MAX_ATTEMPTS - 1, legal=False)


def _row(
    task: dict[str, Any],
    spec: ModelSpec,
    parsed,
    result: ChatResult | None,
    tokens_in: int,
    tokens_out: int,
    cost: float,
    latency: int,
    *,
    retries: int,
    legal: bool = False,
    error: str | None = None,
) -> dict[str, Any]:
    # Reasoning is taken from the attempt that produced the recorded move, so
    # the claims extracted from it describe the same decision that was scored.
    return {
        "task_id": task["id"],
        "model": spec.id,
        "reasoning": parsed.reasoning if parsed else "",
        "hidden_thinking": result.hidden_thinking if result else None,
        "plan": parsed.plan if parsed else "",
        "move": parsed.move if parsed else None,
        "legal": legal,
        "retries": retries,
        "tokens_in": tokens_in,
        "tokens_out": tokens_out,
        "cost_usd": round(cost, 6),
        "latency_ms": latency,
        # Format compliance is a measured property, not just a parsing detail.
        "tagged": sorted(parsed.tagged) if parsed else [],
        "error": error,
        "prompt_version": prompt.PROMPT_VERSION,
        "prompt_hash": prompt.prompt_hash(),
    }


def run(cfg: Config, args: argparse.Namespace) -> None:
    tasks = stratified(read_jsonl(TASKS_PATH), args.limit)
    if not tasks:
        raise SystemExit(f"no tasks in {TASKS_PATH}; run --stage tasks first")

    existing = read_jsonl(RUNS_PATH)
    if args.force:
        selected = {spec.id for spec in cfg.models}
        existing = [row for row in existing if row["model"] not in selected]
        write_jsonl(RUNS_PATH, existing)

    # A row that failed for infrastructure reasons is not a result, so it must
    # not be cached as one. Otherwise the tasks lost to an outage or an
    # exhausted account would be skipped permanently on every later resume --
    # silently, and only for the models unlucky enough to be running at the
    # time.
    existing = [row for row in existing if not row.get("error")]
    write_jsonl(RUNS_PATH, existing)

    done = {(row["task_id"], row["model"]) for row in existing}
    # Task-major rather than model-major, over band-interleaved tasks. A run
    # that dies partway -- a cost cap, an exhausted account, a provider outage
    # -- then leaves every model at roughly the same coverage of every band,
    # instead of the last model in the list holding nothing but easy puzzles.
    work = [
        (task, spec)
        for task in tasks
        for spec in cfg.models
        if (task["id"], spec.id) not in done
    ]

    print(f"run: {len(tasks)} tasks x {len(cfg.models)} models, {len(work)} to request")
    if args.dry_run:
        print("--dry-run: nothing was sent")
        return
    if not work:
        return

    budget = Budget(cfg.limits.max_cost_usd, cfg.limits.abort_after_consecutive_errors)
    client = make_client(cfg.provider.base_url, api_key(cfg.provider))
    write_lock = threading.Lock()
    counter = {"done": 0, "solved": 0, "illegal": 0, "failed": 0}

    def one(item: tuple[dict[str, Any], ModelSpec]) -> None:
        task, spec = item
        if not budget.claim():
            return

        row = ask(client, spec, task, cfg)
        budget.record(row["cost_usd"], failed=row["error"] is not None)

        with write_lock:
            append_jsonl(RUNS_PATH, row)
            counter["done"] += 1
            if row["error"]:
                counter["failed"] += 1
            elif not row["legal"]:
                counter["illegal"] += 1
            elif row["move"] == task["solution_uci"][0]:
                counter["solved"] += 1
            print(
                f"\r  {counter['done']}/{len(work)}  "
                f"solved {counter['solved']}  illegal {counter['illegal']}  "
                f"failed {counter['failed']}  ${budget.spent:.2f}",
                end="",
                file=sys.stderr,
            )

    with ThreadPoolExecutor(max_workers=cfg.limits.concurrency) as pool:
        list(pool.map(one, work))
    client.close()
    print("", file=sys.stderr)

    if budget.stopped:
        print(f"stopped early: {budget.stopped}", file=sys.stderr)

    write_manifest(
        "run",
        {
            "models": [
                {"id": spec.id, "reasoning": spec.reasoning} for spec in cfg.models
            ],
            "tasks": len(tasks),
            "requested": len(work),
            "prompt": {"version": prompt.PROMPT_VERSION, "hash": prompt.prompt_hash()},
            "max_cost_usd": cfg.limits.max_cost_usd,
            "cost_usd": round(budget.spent, 4),
            "stopped_early": budget.stopped,
        },
    )
    print(f"run: {counter['done']} rows, ${budget.spent:.2f} -> {RUNS_PATH}")

    if budget.stopped and "consecutive request failures" in budget.stopped:
        raise SystemExit(1)
