import { overlaps } from "@/bench/leaderboard";
import type { ScoreRow } from "./types";

/**
 * The eval's kill check, applied to any metric that ships with an interval.
 *
 * A metric earns its place only if it does two things at once: spread the
 * models by more than a few points, AND do it by more than the noise. Either
 * alone is a ranking the data cannot support -- a wide spread with overlapping
 * intervals is a coin flip with a podium, and non-overlapping intervals a
 * fraction of a point apart measure nothing anyone cares about.
 *
 * Both halves are reported, so a metric that passes one and fails the other is
 * visible as exactly that rather than rounded to pass or fail.
 */

/** Below this a spread is real but too small to be worth reporting as a result. */
export const KILL_CHECK_POINTS = 5;

export type Separation = {
  /** Points between the best and worst model on this metric. */
  spread: number;
  /** Every pair whose confidence intervals overlap, best-first. */
  overlappingPairs: [string, string][];
  /** Spread clears the threshold and no pair overlaps. */
  separates: boolean;
  low: { label: string; value: number } | null;
  high: { label: string; value: number } | null;
};

type Metric = {
  value: (row: ScoreRow) => number | null;
  ci: (row: ScoreRow) => [number, number];
};

export const METRICS = {
  claimAccuracy: {
    value: (r) => r.claim_accuracy,
    ci: (r) => r.claim_accuracy_ci,
  },
  stateAccuracy: {
    value: (r) => r.state_accuracy,
    ci: (r) => r.state_accuracy_ci,
  },
  lineAccuracy: {
    value: (r) => r.line_accuracy,
    ci: (r) => r.line_accuracy_ci,
  },
  solveRate: {
    value: (r) => r.solve_rate,
    ci: (r) => r.solve_rate_ci,
  },
} satisfies Record<string, Metric>;

export function separationOf(rows: ScoreRow[], metric: Metric): Separation {
  const scored = rows
    .filter((r) => metric.value(r) !== null)
    .map((r) => ({
      label: r.label,
      value: (metric.value(r) as number) * 100,
      ci: metric.ci(r).map((x) => x * 100) as [number, number],
    }))
    .sort((a, b) => b.value - a.value);

  if (scored.length < 2) {
    return {
      spread: 0,
      overlappingPairs: [],
      separates: false,
      low: scored[0] ?? null,
      high: scored[0] ?? null,
    };
  }

  const high = scored[0];
  const low = scored[scored.length - 1];
  const spread = high.value - low.value;

  const overlappingPairs: [string, string][] = [];
  for (let i = 0; i < scored.length; i++) {
    for (let j = i + 1; j < scored.length; j++) {
      if (overlaps(scored[i].ci, scored[j].ci)) {
        overlappingPairs.push([scored[i].label, scored[j].label]);
      }
    }
  }

  return {
    spread,
    overlappingPairs,
    separates: spread >= KILL_CHECK_POINTS && overlappingPairs.length === 0,
    low: { label: low.label, value: low.value },
    high: { label: high.label, value: high.value },
  };
}
