"""Turns verified claims into the numbers the eval reports.

Deliberately pure: it takes rows and returns scores, touching no file and no
engine. These are the figures that go in RESULTS.md, so they need to be
provable in isolation more than anything else in the codebase.

Two choices here are worth arguing with rather than accepting quietly.

`claim_accuracy` divides true by true-plus-false, which means a model that
hedges everything into unverifiable prose can score well on a denominator of
three. That is a real weakness of the metric as specified, so every rate ships
with its raw counts and with claims-per-task, and a small denominator is
visible rather than something a reader has to infer.

Confidence intervals resample tasks, not claims. Claims from one trace are
heavily correlated -- a model that misreads a position is usually wrong about
it several times over -- and resampling them independently would report an
interval several times narrower than the data supports.
"""

from __future__ import annotations

import random
import statistics
from dataclasses import asdict, dataclass, field
from typing import Any, Iterable

BOOTSTRAP_ITERATIONS = 2000
BOOTSTRAP_SEED = 20260905
# Below this a per-theme row is noise dressed up as a finding.
MIN_THEME_TASKS = 10


@dataclass
class TaskOutcome:
    """Everything scoring needs about one model's attempt at one task."""

    task_id: str
    model: str
    rating_band: int
    themes: tuple[str, ...]
    solved: bool
    answered: bool
    claims_true: int
    claims_false: int
    claims_unverifiable: int
    plan_cp_losses: tuple[int, ...]
    played_cp_loss: int | None
    plan_move: str | None
    played_move: str | None
    cost_usd: float
    retries: int
    extraction_failed: bool

    @property
    def verifiable(self) -> int:
        return self.claims_true + self.claims_false

    @property
    def claims(self) -> int:
        return self.verifiable + self.claims_unverifiable

    @property
    def consistent(self) -> bool | None:
        """Whether the stated plan and the played move agree.

        None when the plan could not be resolved to a move at all. Counting
        that as a disagreement would measure the resolver rather than the model.
        """
        if self.plan_move is None or self.played_move is None:
            return None
        return self.plan_move == self.played_move


@dataclass
class Scores:
    scope: str
    model: str
    label: str
    tasks: int
    solve_rate: float
    solve_rate_ci: tuple[float, float]
    claim_accuracy: float | None
    claim_accuracy_ci: tuple[float, float] | None
    reasoning_outcome_gap: float | None
    unverifiable_rate: float | None
    claims_true: int
    claims_false: int
    claims_unverifiable: int
    claims_per_task: float
    plan_cp_loss_median: float | None
    played_cp_loss_median: float | None
    consistency: float | None
    plan_resolved_rate: float
    illegal_rate: float
    extraction_failure_rate: float
    cost_per_task: float
    total_cost_usd: float

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


def _mean(values: Iterable[float]) -> float:
    values = list(values)
    return sum(values) / len(values) if values else 0.0


def _median(values: Iterable[float]) -> float | None:
    values = list(values)
    return statistics.median(values) if values else None


def bootstrap_ci(
    values: list[float],
    iterations: int = BOOTSTRAP_ITERATIONS,
    alpha: float = 0.05,
    seed: int = BOOTSTRAP_SEED,
) -> tuple[float, float]:
    """Percentile interval for a mean, seeded so a published figure reproduces."""
    if not values:
        return (0.0, 0.0)
    if len(values) == 1:
        return (values[0], values[0])

    rng = random.Random(seed)
    n = len(values)
    means = sorted(
        sum(values[rng.randrange(n)] for _ in range(n)) / n for _ in range(iterations)
    )
    return (
        means[int(alpha / 2 * iterations)],
        means[min(iterations - 1, int((1 - alpha / 2) * iterations))],
    )


def bootstrap_ratio_ci(
    pairs: list[tuple[int, int]],
    iterations: int = BOOTSTRAP_ITERATIONS,
    alpha: float = 0.05,
    seed: int = BOOTSTRAP_SEED,
) -> tuple[float, float]:
    """Interval for a pooled ratio, resampling whole tasks.

    Each pair is one task's (numerator, denominator). Resampling tasks rather
    than claims keeps claims from the same trace together, which is the only
    way the interval reflects how much independent evidence there actually is.
    """
    usable = [pair for pair in pairs if pair[1] > 0]
    if not usable:
        return (0.0, 0.0)
    if len(usable) == 1:
        value = usable[0][0] / usable[0][1]
        return (value, value)

    rng = random.Random(seed)
    n = len(usable)
    ratios = []
    for _ in range(iterations):
        top = bottom = 0
        for _ in range(n):
            hit, total = usable[rng.randrange(n)]
            top += hit
            bottom += total
        ratios.append(top / bottom if bottom else 0.0)
    ratios.sort()
    return (
        ratios[int(alpha / 2 * iterations)],
        ratios[min(iterations - 1, int((1 - alpha / 2) * iterations))],
    )


def summarise(outcomes: list[TaskOutcome], scope: str, model: str, label: str) -> Scores:
    n = len(outcomes)
    if n == 0:
        raise ValueError("cannot summarise an empty set of outcomes")

    solved = [1.0 if o.solved else 0.0 for o in outcomes]
    solve_rate = _mean(solved)

    true_total = sum(o.claims_true for o in outcomes)
    false_total = sum(o.claims_false for o in outcomes)
    unverifiable_total = sum(o.claims_unverifiable for o in outcomes)
    verifiable_total = true_total + false_total
    claims_total = verifiable_total + unverifiable_total

    claim_accuracy = true_total / verifiable_total if verifiable_total else None
    claim_accuracy_ci = (
        bootstrap_ratio_ci([(o.claims_true, o.verifiable) for o in outcomes])
        if verifiable_total
        else None
    )

    consistencies = [o.consistent for o in outcomes if o.consistent is not None]
    plan_losses = [loss for o in outcomes for loss in o.plan_cp_losses]
    played_losses = [o.played_cp_loss for o in outcomes if o.played_cp_loss is not None]
    total_cost = sum(o.cost_usd for o in outcomes)

    return Scores(
        scope=scope,
        model=model,
        label=label,
        tasks=n,
        solve_rate=solve_rate,
        solve_rate_ci=bootstrap_ci(solved),
        claim_accuracy=claim_accuracy,
        claim_accuracy_ci=claim_accuracy_ci,
        # The headline. A model that plays well while describing the position
        # wrongly has a large positive gap; one that reasons soundly and still
        # picks the wrong move has a negative one.
        reasoning_outcome_gap=(
            solve_rate - claim_accuracy if claim_accuracy is not None else None
        ),
        unverifiable_rate=(unverifiable_total / claims_total if claims_total else None),
        claims_true=true_total,
        claims_false=false_total,
        claims_unverifiable=unverifiable_total,
        claims_per_task=claims_total / n,
        plan_cp_loss_median=_median(plan_losses),
        played_cp_loss_median=_median(played_losses),
        consistency=_mean(1.0 if c else 0.0 for c in consistencies) if consistencies else None,
        plan_resolved_rate=len(consistencies) / n,
        illegal_rate=_mean(0.0 if o.answered else 1.0 for o in outcomes),
        extraction_failure_rate=_mean(1.0 if o.extraction_failed else 0.0 for o in outcomes),
        cost_per_task=total_cost / n,
        total_cost_usd=total_cost,
    )


def by_band(outcomes: list[TaskOutcome], model: str, label: str) -> list[Scores]:
    bands: dict[int, list[TaskOutcome]] = {}
    for outcome in outcomes:
        bands.setdefault(outcome.rating_band, []).append(outcome)
    return [
        summarise(bands[band], f"band:{band}", model, label) for band in sorted(bands)
    ]


def by_theme(outcomes: list[TaskOutcome], model: str, label: str) -> list[Scores]:
    themes: dict[str, list[TaskOutcome]] = {}
    for outcome in outcomes:
        for theme in outcome.themes:
            themes.setdefault(theme, []).append(outcome)

    return [
        summarise(rows, f"theme:{theme}", model, label)
        for theme, rows in sorted(themes.items())
        if len(rows) >= MIN_THEME_TASKS
    ]


def separated(a: tuple[float, float], b: tuple[float, float]) -> bool:
    """True when two intervals do not overlap.

    Used to say whether the data actually distinguishes two models, rather than
    implying a ranking the sample size cannot support.
    """
    return a[1] < b[0] or b[1] < a[0]
