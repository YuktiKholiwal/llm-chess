import { bootstrapCI, summarise, type CategoryScore, type Grade } from "./grade";

/**
 * Published run results and the aggregation that turns them into a leaderboard.
 *
 * A published result is the citable artifact: it carries the position-set hash,
 * the prompt hash and the grading engine, so any row on the board can be traced
 * to exactly the conditions that produced it. Rows from different conditions
 * are never averaged together -- they are different measurements.
 */

export type PublishedEntry = {
  modelId: string;
  label: string;
  vendor: string;
  n: number;
  accuracy: number;
  accuracyCI: [number, number];
  acpl: number;
  top1Rate: number;
  topKRate: number;
  blunderRate: number;
  failureRate: number;
  evalErrorPawns: number;
  evalCompliance: number;
  illegalPerPosition: number;
  totalTokens: number;
  totalCost: number;
  costPerPosition: number;
  avgLatencyMs: number;
  /** Robust to the multi-minute stalls a hung request produces. */
  medianLatencyMs: number;
  byCategory: CategoryScore[];
};

export type PublishedRun = {
  runId: string;
  publishedAt: string;
  set: { id: string; hash: string; positions: number };
  prompt: { version: string; hash: string };
  mode: "assisted" | "blind";
  gradingEngine: string;
  gradingDepth: number;
  entries: PublishedEntry[];
};

/** The conditions under which a score was produced. Scores only compare within one. */
export type Condition = {
  setId: string;
  setHash: string;
  mode: string;
  promptVersion: string;
};

export function conditionKey(c: Condition): string {
  return `${c.setId}|${c.setHash}|${c.mode}|${c.promptVersion}`;
}

export type LeaderboardRow = PublishedEntry & {
  rank: number;
  runIds: string[];
  publishedAt: string;
};

export type LeaderboardView = {
  condition: Condition;
  gradingEngine: string;
  gradingDepth: number;
  positions: number;
  rows: LeaderboardRow[];
};

/**
 * Groups published runs into one board per condition. A model appearing in
 * several runs of the same condition keeps its most recent result rather than
 * being averaged: runs may use different subsets, and averaging across them
 * would silently weight by sample size in a way nobody asked for.
 */
export function buildLeaderboards(runs: PublishedRun[]): LeaderboardView[] {
  const byCondition = new Map<
    string,
    { condition: Condition; run: PublishedRun; entries: Map<string, { e: PublishedEntry; runId: string; at: string }> }
  >();

  for (const run of runs) {
    const condition: Condition = {
      setId: run.set.id,
      setHash: run.set.hash,
      mode: run.mode,
      promptVersion: run.prompt.version,
    };
    const key = conditionKey(condition);
    const bucket =
      byCondition.get(key) ?? { condition, run, entries: new Map() };

    for (const e of run.entries) {
      const prev = bucket.entries.get(e.modelId);
      if (!prev || run.publishedAt > prev.at) {
        bucket.entries.set(e.modelId, { e, runId: run.runId, at: run.publishedAt });
      }
    }
    // Keep the newest run's metadata for the header.
    if (run.publishedAt >= bucket.run.publishedAt) bucket.run = run;
    byCondition.set(key, bucket);
  }

  return [...byCondition.values()]
    .map(({ condition, run, entries }) => {
      const rows = [...entries.values()]
        .map(({ e, runId, at }) => ({ ...e, rank: 0, runIds: [runId], publishedAt: at }))
        // Accuracy first, then fewer blunders, then cheaper. Ties on the
        // headline number are broken by the things a buyer would care about.
        .sort(
          (a, b) =>
            b.accuracy - a.accuracy ||
            a.blunderRate - b.blunderRate ||
            a.costPerPosition - b.costPerPosition,
        )
        .map((r, i) => ({ ...r, rank: i + 1 }));

      return {
        condition,
        gradingEngine: run.gradingEngine,
        gradingDepth: run.gradingDepth,
        positions: run.set.positions,
        rows,
      };
    })
    .sort((a, b) => b.rows.length - a.rows.length);
}

/**
 * True when two intervals overlap, i.e. the difference between the two models
 * is not resolved by this much data. The board uses it to avoid implying a
 * ranking the sample size cannot support.
 */
export function overlaps(a: [number, number], b: [number, number]): boolean {
  return a[0] <= b[1] && b[0] <= a[1];
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return Math.round(s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2);
}

/** Builds one published entry from graded results. */
export function makeEntry(
  modelId: string,
  meta: { label: string; vendor: string },
  grades: Grade[],
  /** Grades split by position category, for the per-category breakdown. */
  byCategory: { category: string; grades: Grade[] }[],
  usage: { totalTokens: number; totalCost: number; latenciesMs: number[] },
): PublishedEntry {
  const overall = summarise(grades);
  const ci = bootstrapCI(grades.filter((g) => g.answered).map((g) => g.accuracy ?? 0));
  const n = grades.length || 1;

  return {
    modelId,
    label: meta.label,
    vendor: meta.vendor,
    n: grades.length,
    accuracy: overall.accuracy,
    accuracyCI: [ci.lo, ci.hi],
    acpl: overall.acpl,
    top1Rate: overall.top1Rate,
    topKRate: overall.topKRate,
    blunderRate: overall.blunderRate,
    failureRate: overall.failureRate,
    evalErrorPawns: overall.evalErrorPawns,
    evalCompliance: overall.evalCompliance,
    illegalPerPosition: overall.illegalPerPosition,
    totalTokens: usage.totalTokens,
    totalCost: Number(usage.totalCost.toFixed(6)),
    costPerPosition: Number((usage.totalCost / n).toFixed(6)),
    avgLatencyMs: Math.round(
      usage.latenciesMs.reduce((a, b) => a + b, 0) / (usage.latenciesMs.length || 1),
    ),
    medianLatencyMs: median(usage.latenciesMs),
    byCategory: byCategory
      .filter((c) => c.grades.length > 0)
      .map((c) => summarise(c.grades, c.category)),
  };
}
