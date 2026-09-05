"""Assembles the scores and writes results.json and RESULTS.md.

The headline is the gap between solve rate and claim accuracy, because that is
the thing this eval exists to see: whether a model that finds the right move
also describes the position correctly, or whether it arrives at good answers
while narrating something that is not on the board.

RESULTS.md states its own limitations. A results file that omits them is not
shorter, it is just less true, and the two that matter here -- contamination is
not controlled, and claim accuracy rewards vagueness -- are both properties a
reader would otherwise have to discover by reading the source.
"""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

import chess

from ..config import (
    CLAIMS_PATH,
    RESULTS_PATH,
    RUNS_PATH,
    TASKS_PATH,
    VERIFIED_PATH,
    Config,
)
from ..manifest import git_commit, now, write_manifest
from ..store import read_jsonl, write_json
from ..verifier.handlers import move_from_text
from .aggregate import Scores, TaskOutcome, by_band, by_theme, separated, summarise

RESULTS_MD = Path("RESULTS.md")
# The spread below which the eval has not separated the models.
KILL_CHECK_POINTS = 5.0


def collect(cfg: Config) -> dict[str, list[TaskOutcome]]:
    tasks = {task["id"]: task for task in read_jsonl(TASKS_PATH)}

    failed_extraction = {
        (row["task_id"], row["model"])
        for row in read_jsonl(CLAIMS_PATH)
        if row.get("extraction_failed")
    }

    verified: dict[tuple[str, str], list[dict]] = {}
    for row in read_jsonl(VERIFIED_PATH):
        verified.setdefault((row["task_id"], row["model"]), []).append(row)

    outcomes: dict[str, list[TaskOutcome]] = {}
    for run in read_jsonl(RUNS_PATH):
        task = tasks.get(run["task_id"])
        if task is None:
            continue
        key = (run["task_id"], run["model"])
        rows = verified.get(key, [])
        # The sentinel row stands in for a run with no claims; it is not a claim.
        claims = [row for row in rows if row["claim_id"] >= 0]
        head = rows[0] if rows else {}

        outcomes.setdefault(run["model"], []).append(
            TaskOutcome(
                task_id=run["task_id"],
                model=run["model"],
                rating_band=task["rating_band"],
                themes=tuple(task["themes"]),
                solved=bool(run.get("legal")) and run.get("move") == task["solution_uci"][0],
                answered=bool(run.get("legal")),
                claims_true=sum(1 for c in claims if c["verdict"] is True),
                claims_false=sum(1 for c in claims if c["verdict"] is False),
                claims_unverifiable=sum(1 for c in claims if c["verdict"] is None),
                plan_cp_losses=(
                    (head["plan_move_cp_loss"],)
                    if head.get("plan_move_cp_loss") is not None
                    else ()
                ),
                played_cp_loss=head.get("played_cp_loss"),
                plan_move=head.get("plan_move"),
                played_move=head.get("played_move"),
                cost_usd=float(run.get("cost_usd") or 0.0),
                retries=int(run.get("retries") or 0),
                extraction_failed=key in failed_extraction,
                plan_named_move=move_from_text(
                    chess.Board(task["fen"]), run.get("plan") or ""
                )
                is not None,
            )
        )
    return outcomes


def pct(value: float | None, places: int = 1) -> str:
    return "—" if value is None else f"{value * 100:.{places}f}%"


def num(value: float | None, places: int = 0) -> str:
    return "—" if value is None else f"{value:.{places}f}"


def signed_pct(value: float | None) -> str:
    if value is None:
        return "—"
    return f"{'+' if value >= 0 else ''}{value * 100:.1f}"


def headline_table(scores: list[Scores]) -> str:
    lines = [
        "| Model | Solve rate | Claim accuracy | Gap | Unverifiable | Sound plans | Consistency | Plans naming a move | $/task |",
        "|---|---|---|---|---|---|---|---|---|",
    ]
    for s in scores:
        lines.append(
            f"| {s.label} | {pct(s.solve_rate)} | {pct(s.claim_accuracy)} "
            f"| {signed_pct(s.reasoning_outcome_gap)} | {pct(s.unverifiable_rate)} "
            f"| {pct(s.plan_sound_rate)} | {pct(s.consistency)} "
            f"| {pct(s.plan_named_rate)} | ${s.cost_per_task:.4f} |"
        )
    return "\n".join(lines)


def evidence_table(scores: list[Scores]) -> str:
    lines = [
        "| Model | Claims/task | True | False | Unverifiable | Claim accuracy 95% CI | Solve rate 95% CI |",
        "|---|---|---|---|---|---|---|",
    ]
    for s in scores:
        ci = (
            f"[{pct(s.claim_accuracy_ci[0])}, {pct(s.claim_accuracy_ci[1])}]"
            if s.claim_accuracy_ci
            else "—"
        )
        solve_ci = f"[{pct(s.solve_rate_ci[0])}, {pct(s.solve_rate_ci[1])}]"
        lines.append(
            f"| {s.label} | {s.claims_per_task:.1f} | {s.claims_true} | {s.claims_false} "
            f"| {s.claims_unverifiable} | {ci} | {solve_ci} |"
        )
    return "\n".join(lines)


def breakdown_table(rows: list[Scores], heading: str) -> str:
    lines = [
        f"| {heading} | Model | n | Solve rate | Claim accuracy | Gap |",
        "|---|---|---|---|---|---|",
    ]
    for s in rows:
        lines.append(
            f"| {s.scope.split(':', 1)[1]} | {s.label} | {s.tasks} | {pct(s.solve_rate)} "
            f"| {pct(s.claim_accuracy)} | {signed_pct(s.reasoning_outcome_gap)} |"
        )
    return "\n".join(lines)


def kill_check(scores: list[Scores]) -> str:
    """States plainly whether the eval separated the models.

    Two questions, not one. A spread under five points is the brief's trigger,
    but overlapping intervals matter independently: a wide spread that the
    sample cannot resolve is not a result either, and reporting it as one would
    be the exact mistake the check exists to prevent.
    """
    measured = [s for s in scores if s.claim_accuracy is not None]
    if len(measured) < 2:
        return (
            "Not enough models produced verifiable claims to compare. "
            "The eval has not been shown to discriminate."
        )

    ranked = sorted(measured, key=lambda s: s.claim_accuracy or 0.0, reverse=True)
    spread = (ranked[0].claim_accuracy - ranked[-1].claim_accuracy) * 100

    overlapping = [
        f"{a.label} and {b.label}"
        for i, a in enumerate(ranked)
        for b in ranked[i + 1 :]
        if a.claim_accuracy_ci
        and b.claim_accuracy_ci
        and not separated(a.claim_accuracy_ci, b.claim_accuracy_ci)
    ]

    parts = [
        f"Claim accuracy spans **{spread:.1f} points**, from "
        f"{pct(ranked[-1].claim_accuracy)} ({ranked[-1].label}) to "
        f"{pct(ranked[0].claim_accuracy)} ({ranked[0].label})."
    ]

    if spread <= KILL_CHECK_POINTS:
        parts.append(
            f"**That is within the {KILL_CHECK_POINTS:.0f}-point kill-check threshold. "
            "The eval is not discriminative yet and needs rethinking before anything "
            "is added to it.**"
        )
    else:
        parts.append(
            f"That clears the {KILL_CHECK_POINTS:.0f}-point kill-check threshold."
        )

    if overlapping:
        parts.append(
            "Confidence intervals still overlap for "
            + "; ".join(overlapping)
            + " — the data does not separate those pairs, whatever the point "
            "estimates suggest."
        )
    else:
        parts.append("No two models' confidence intervals overlap.")

    return " ".join(parts)


def render(cfg: Config, overall: list[Scores], bands: list[Scores], themes: list[Scores]) -> str:
    ranked = sorted(overall, key=lambda s: s.solve_rate, reverse=True)
    tasks = ranked[0].tasks if ranked else 0
    total_cost = sum(s.total_cost_usd for s in overall)

    return f"""# Chess reasoning eval — results

Models solve Lichess puzzles and write out their reasoning. Every factual claim
in that reasoning is extracted and checked against python-chess and Stockfish.
The number this eval exists to produce is the **gap** between how often a model
picks the right move and how often the things it says about the position are
true.

Run {now()} at commit `{git_commit() or 'unknown'}` · {tasks} puzzles per model ·
Stockfish depth {cfg.engine.depth} · total spend ${total_cost:.2f}.

## Headline

{headline_table(ranked)}

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

{kill_check(overall)}

## How much evidence is behind each number

{evidence_table(ranked)}

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

{breakdown_table(bands, "Band")}

## By motif

{breakdown_table(themes, "Theme")}

Only motifs appearing in at least 10 tasks are shown; below that a row is noise
dressed up as a finding.

## What this does not measure

**Contamination is not controlled.** The Lichess puzzle export carries no
puzzle creation date — its only date column marks the day a puzzle was featured
as the daily puzzle, and is absent for almost all of them — so the intended
"created after 2026-06-01" filter had nothing to filter on. These puzzles may
well appear in training data. Nothing here separates recall from reasoning.

**Claim extraction is a model, not an oracle.** Claims are extracted by
{cfg.extractor.label}, and a claim it fails to extract is one the model is
never held to. `scripts/eval_extractor.py` measures recall and precision
against a hand-labelled set; until that set is labelled, the extractor's own
error rate is unmeasured and is not included in any interval above.

**Plan scoring depends on resolving a sentence to a move.** Where a plan names
its move, that move is read from the text. Where it does not, a model call
resolves it, and plans that resolve to nothing are excluded rather than
assumed. The share that resolved at all is reported as part of the run.
"""


def run(cfg: Config, args: argparse.Namespace) -> None:
    outcomes = collect(cfg)
    if not outcomes:
        raise SystemExit(f"nothing to score in {RUNS_PATH}; run the earlier stages first")

    labels = {spec.id: spec.label for spec in cfg.models}
    overall: list[Scores] = []
    bands: list[Scores] = []
    themes: list[Scores] = []

    for model, rows in outcomes.items():
        label = labels.get(model, model)
        overall.append(summarise(rows, "overall", model, label))
        bands.extend(by_band(rows, model, label))
        themes.extend(by_theme(rows, model, label))

    bands.sort(key=lambda s: (s.scope, -s.solve_rate))
    themes.sort(key=lambda s: (s.scope, -s.solve_rate))

    payload: dict[str, Any] = {
        "generated_at": now(),
        "commit": git_commit(),
        "engine_depth": cfg.engine.depth,
        "extractor": cfg.extractor.id,
        "overall": [s.as_dict() for s in overall],
        "by_band": [s.as_dict() for s in bands],
        "by_theme": [s.as_dict() for s in themes],
    }
    write_json(RESULTS_PATH, payload)
    RESULTS_MD.write_text(render(cfg, overall, bands, themes), encoding="utf-8")

    write_manifest(
        "score",
        {
            "models": sorted(outcomes),
            "tasks_per_model": {model: len(rows) for model, rows in outcomes.items()},
            "results": str(RESULTS_PATH),
            "report": str(RESULTS_MD),
        },
    )

    for s in sorted(overall, key=lambda s: s.solve_rate, reverse=True):
        print(
            f"{s.label:<22} solve {pct(s.solve_rate):>7}  "
            f"claims {pct(s.claim_accuracy):>7}  gap {signed_pct(s.reasoning_outcome_gap):>6}  "
            f"unverifiable {pct(s.unverifiable_rate):>7}"
        )
    print(f"\nwritten to {RESULTS_PATH} and {RESULTS_MD}")
