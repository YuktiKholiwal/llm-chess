"""The arithmetic behind every number in RESULTS.md.

These are the figures the eval publishes, so the properties worth pinning are
the ones that would silently corrupt a headline: that unverifiable claims stay
out of the accuracy denominator, that an unresolvable plan does not count as an
inconsistency, and that intervals resample tasks rather than claims.
"""

from __future__ import annotations

import pytest

from eval.scorer.aggregate import (
    TaskOutcome,
    bootstrap_ci,
    bootstrap_ratio_ci,
    by_band,
    by_theme,
    separated,
    summarise,
)


def outcome(**overrides) -> TaskOutcome:
    base = dict(
        task_id="t1",
        model="m",
        rating_band=1600,
        themes=("fork",),
        solved=True,
        answered=True,
        claims_true=3,
        claims_false=1,
        claims_unverifiable=1,
        state_true=2,
        state_false=1,
        line_true=1,
        line_false=0,
        plan_cp_losses=(20,),
        played_cp_loss=10,
        plan_move="e2e4",
        played_move="e2e4",
        cost_usd=0.01,
        retries=0,
        extraction_failed=False,
        plan_named_move=True,
    )
    return TaskOutcome(**{**base, **overrides})


class TestClaimAccuracy:
    def test_divides_true_by_true_plus_false(self):
        scores = summarise([outcome(claims_true=3, claims_false=1)], "overall", "m", "M")
        assert scores.claim_accuracy == pytest.approx(0.75)

    def test_unverifiable_claims_stay_out_of_the_denominator(self):
        # Adding vague prose must not move the accuracy figure at all.
        few = summarise([outcome(claims_unverifiable=0)], "overall", "m", "M")
        many = summarise([outcome(claims_unverifiable=50)], "overall", "m", "M")
        assert few.claim_accuracy == many.claim_accuracy

    def test_but_it_does_move_the_unverifiable_rate(self):
        few = summarise([outcome(claims_unverifiable=0)], "overall", "m", "M")
        many = summarise([outcome(claims_unverifiable=50)], "overall", "m", "M")
        assert many.unverifiable_rate > few.unverifiable_rate

    def test_reports_no_accuracy_when_nothing_was_verifiable(self):
        scores = summarise(
            [outcome(claims_true=0, claims_false=0, claims_unverifiable=4)],
            "overall", "m", "M",
        )
        assert scores.claim_accuracy is None
        assert scores.reasoning_outcome_gap is None
        assert scores.unverifiable_rate == pytest.approx(1.0)

    def test_carries_the_raw_counts_so_a_thin_denominator_is_visible(self):
        scores = summarise(
            [outcome(claims_true=1, claims_false=0, claims_unverifiable=20)],
            "overall", "m", "M",
        )
        assert scores.claim_accuracy == pytest.approx(1.0)
        assert (scores.claims_true, scores.claims_false) == (1, 0)
        assert scores.claims_per_task == pytest.approx(21.0)


class TestGap:
    def test_is_solve_rate_minus_claim_accuracy(self):
        scores = summarise(
            [
                outcome(solved=True, claims_true=1, claims_false=1),
                outcome(solved=True, claims_true=1, claims_false=1),
            ],
            "overall", "m", "M",
        )
        assert scores.solve_rate == pytest.approx(1.0)
        assert scores.claim_accuracy == pytest.approx(0.5)
        assert scores.reasoning_outcome_gap == pytest.approx(0.5)

    def test_goes_negative_when_reasoning_beats_move_choice(self):
        scores = summarise(
            [outcome(solved=False, claims_true=4, claims_false=0)], "overall", "m", "M"
        )
        assert scores.reasoning_outcome_gap == pytest.approx(-1.0)


class TestConsistency:
    def test_counts_agreement_between_the_plan_and_the_move(self):
        scores = summarise(
            [
                outcome(plan_move="e2e4", played_move="e2e4"),
                outcome(plan_move="d2d4", played_move="e2e4"),
            ],
            "overall", "m", "M",
        )
        assert scores.consistency == pytest.approx(0.5)

    def test_an_unresolvable_plan_is_excluded_rather_than_counted_against(self):
        # Otherwise the metric would measure the plan resolver, not the model.
        scores = summarise(
            [outcome(plan_move="e2e4", played_move="e2e4"), outcome(plan_move=None)],
            "overall", "m", "M",
        )
        assert scores.consistency == pytest.approx(1.0)
        assert scores.plan_resolved_rate == pytest.approx(0.5)

    def test_reports_nothing_when_no_plan_resolved_at_all(self):
        scores = summarise([outcome(plan_move=None)], "overall", "m", "M")
        assert scores.consistency is None
        assert scores.plan_resolved_rate == 0.0


class TestOtherRates:
    def test_an_illegal_answer_counts_against_the_illegal_rate(self):
        scores = summarise(
            [outcome(answered=True), outcome(answered=False)], "overall", "m", "M"
        )
        assert scores.illegal_rate == pytest.approx(0.5)

    def test_medians_ignore_missing_values(self):
        scores = summarise(
            [outcome(played_cp_loss=10), outcome(played_cp_loss=None), outcome(played_cp_loss=30)],
            "overall", "m", "M",
        )
        assert scores.played_cp_loss_median == pytest.approx(20)

    def test_cost_is_per_task(self):
        scores = summarise(
            [outcome(cost_usd=0.02), outcome(cost_usd=0.04)], "overall", "m", "M"
        )
        assert scores.cost_per_task == pytest.approx(0.03)
        assert scores.total_cost_usd == pytest.approx(0.06)


class TestBreakdowns:
    def test_splits_by_rating_band(self):
        rows = by_band(
            [outcome(rating_band=1200), outcome(rating_band=2400), outcome(rating_band=2400)],
            "m", "M",
        )
        assert [r.scope for r in rows] == ["band:1200", "band:2400"]
        assert [r.tasks for r in rows] == [1, 2]

    def test_a_task_counts_toward_every_motif_it_carries(self):
        rows = by_theme([outcome(themes=("fork", "pin"))] * 12, "m", "M")
        assert {r.scope for r in rows} == {"theme:fork", "theme:pin"}

    def test_drops_motifs_too_rare_to_say_anything_about(self):
        rows = by_theme([outcome(themes=("fork",))] * 9, "m", "M")
        assert rows == []

    def test_summarising_nothing_is_an_error_not_a_zero(self):
        with pytest.raises(ValueError):
            summarise([], "overall", "m", "M")


class TestIntervals:
    def test_brackets_the_mean(self):
        values = [0.0, 1.0] * 40
        lo, hi = bootstrap_ci(values)
        assert lo < 0.5 < hi

    def test_is_reproducible(self):
        values = [0.0, 1.0, 1.0, 0.0, 1.0] * 12
        assert bootstrap_ci(values) == bootstrap_ci(values)

    def test_narrows_as_evidence_accumulates(self):
        small = bootstrap_ci([0.0, 1.0] * 5)
        large = bootstrap_ci([0.0, 1.0] * 200)
        assert (large[1] - large[0]) < (small[1] - small[0])

    def test_handles_degenerate_input(self):
        assert bootstrap_ci([]) == (0.0, 0.0)
        assert bootstrap_ci([0.7]) == (0.7, 0.7)

    def test_ratio_interval_brackets_the_pooled_ratio(self):
        pairs = [(1, 2)] * 60
        lo, hi = bootstrap_ratio_ci(pairs)
        assert lo <= 0.5 <= hi

    def test_ratio_interval_ignores_tasks_with_no_verifiable_claims(self):
        with_empties = bootstrap_ratio_ci([(1, 2)] * 30 + [(0, 0)] * 30)
        without = bootstrap_ratio_ci([(1, 2)] * 30)
        assert with_empties == without

    def test_clustering_by_task_reports_wider_intervals_than_treating_claims_alone(self):
        # Ten tasks each contributing ten identical claims carry ten tasks'
        # worth of evidence, not a hundred claims' worth.
        clustered = bootstrap_ratio_ci([(10, 10)] * 5 + [(0, 10)] * 5)
        spread_out = bootstrap_ratio_ci([(1, 1)] * 50 + [(0, 1)] * 50)
        assert (clustered[1] - clustered[0]) > (spread_out[1] - spread_out[0])


class TestSeparation:
    def test_detects_intervals_that_do_not_overlap(self):
        assert separated((0.1, 0.2), (0.3, 0.4)) is True

    def test_detects_overlap_in_either_order(self):
        assert separated((0.1, 0.35), (0.3, 0.4)) is False
        assert separated((0.3, 0.4), (0.1, 0.35)) is False

    def test_touching_intervals_are_not_separated(self):
        assert separated((0.1, 0.3), (0.3, 0.5)) is False


class TestPlanConfounds:
    """Two numbers that keep the plan metrics from being read as more than they are.

    Consistency compares the plan's move with the played move -- but where a
    plan does not name a move, an inference stands in for it, and the
    resolver's mistakes then read as the model contradicting itself. And cp
    loss on puzzles is bimodal: a plan finds the tactic or throws the game
    away, so a median lands in a gap where almost nothing actually falls.
    """

    def test_reports_how_often_plans_named_their_own_move(self):
        scores = summarise(
            [outcome(plan_named_move=True)] * 3 + [outcome(plan_named_move=False)],
            "overall", "m", "M",
        )
        assert scores.plan_named_rate == pytest.approx(0.75)

    def test_a_model_that_never_names_its_move_is_visible_as_such(self):
        scores = summarise([outcome(plan_named_move=False)] * 4, "overall", "m", "M")
        assert scores.plan_named_rate == 0.0

    def test_sound_plans_are_those_within_a_pawn_of_best(self):
        scores = summarise(
            [
                outcome(plan_cp_losses=(0,)),
                outcome(plan_cp_losses=(100,)),
                outcome(plan_cp_losses=(101,)),
                outcome(plan_cp_losses=(9500,)),
            ],
            "overall", "m", "M",
        )
        assert scores.plan_sound_rate == pytest.approx(0.5)

    def test_the_sound_rate_survives_the_bimodality_a_median_hides(self):
        # Half the plans perfect, half catastrophic: the median lands at a
        # value no plan is near, while the sound rate says exactly what happened.
        bimodal = [outcome(plan_cp_losses=(0,))] * 5 + [outcome(plan_cp_losses=(9800,))] * 5
        scores = summarise(bimodal, "overall", "m", "M")
        assert scores.plan_sound_rate == pytest.approx(0.5)
        assert scores.plan_cp_loss_median == pytest.approx(4900)

    def test_reports_nothing_where_no_plan_was_scored(self):
        assert summarise([outcome(plan_cp_losses=())], "overall", "m", "M").plan_sound_rate is None
