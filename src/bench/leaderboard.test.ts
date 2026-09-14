import { describe, expect, it } from "vitest";
import {
  buildLeaderboards,
  conditionKey,
  makeEntry,
  overlaps,
  type PublishedEntry,
  type PublishedRun,
} from "./leaderboard";
import type { Grade } from "./grade";

const g = (o: Partial<Grade> = {}): Grade => ({
  answered: true,
  cpLoss: 0,
  accuracy: 100,
  top1: false,
  topK: false,
  quality: "best",
  evalErrorPawns: null,
  evalSupplied: false,
  illegalAttempts: 0,
  ...o,
});

const entry = (o: Partial<PublishedEntry> & { modelId: string }): PublishedEntry => ({
  label: o.modelId,
  vendor: "test",
  n: 10,
  accuracy: 80,
  accuracyCI: [70, 90],
  acpl: 50,
  top1Rate: 30,
  topKRate: 60,
  blunderRate: 10,
  failureRate: 0,
  evalErrorPawns: 1,
  evalCompliance: 100,
  illegalPerPosition: 0,
  totalTokens: 1000,
  totalCost: 0.01,
  costPerPosition: 0.001,
  avgLatencyMs: 2000,
  medianLatencyMs: 2000,
  byCategory: [],
  ...o,
});

const run = (o: Partial<PublishedRun> & { runId: string; entries: PublishedEntry[] }): PublishedRun => ({
  publishedAt: "2026-09-01T00:00:00.000Z",
  set: { id: "core-v1", hash: "aaaa1111", positions: 120 },
  prompt: { version: "v1-neutral", hash: "12750a8b" },
  mode: "assisted",
  gradingEngine: "Stockfish 18",
  gradingDepth: 16,
  ...o,
});

describe("makeEntry", () => {
  it("summarises grades and attaches a confidence interval", () => {
    const grades = [g({ accuracy: 90 }), g({ accuracy: 80 }), g({ accuracy: 100 })];
    const e = makeEntry("m", { label: "M", vendor: "v" }, grades, [], {
      totalTokens: 3000,
      totalCost: 0.03,
      latenciesMs: [1000, 2000, 3000],
    });
    expect(e.n).toBe(3);
    expect(e.accuracy).toBe(90);
    expect(e.accuracyCI[0]).toBeLessThanOrEqual(90);
    expect(e.accuracyCI[1]).toBeGreaterThanOrEqual(90);
    expect(e.costPerPosition).toBeCloseTo(0.01, 6);
    expect(e.avgLatencyMs).toBe(2000);
    expect(e.medianLatencyMs).toBe(2000);
  });

  it("breaks results down by category, omitting empty ones", () => {
    const e = makeEntry("m", { label: "M", vendor: "v" }, [g(), g()], [
      { category: "tactical", grades: [g({ accuracy: 50 })] },
      { category: "endgame", grades: [] },
    ], { totalTokens: 0, totalCost: 0, latenciesMs: [] });
    expect(e.byCategory).toHaveLength(1);
    expect(e.byCategory[0].category).toBe("tactical");
    expect(e.byCategory[0].accuracy).toBe(50);
  });

  it("does not divide by zero on an empty run", () => {
    const e = makeEntry("m", { label: "M", vendor: "v" }, [], [], {
      totalTokens: 0,
      totalCost: 0,
      latenciesMs: [],
    });
    expect(e.n).toBe(0);
    expect(Number.isFinite(e.costPerPosition)).toBe(true);
  });
});

describe("latency reporting", () => {
  it("reports a median that survives a stalled request", () => {
    // Observed in a real run: two gpt-5-nano positions took 584s and 820s,
    // dragging the mean from ~16s to 62s.
    const grades = Array.from({ length: 8 }, () => g());
    const e = makeEntry("m", { label: "M", vendor: "v" }, grades, [], {
      totalTokens: 0,
      totalCost: 0,
      latenciesMs: [15000, 16000, 14000, 17000, 15500, 16500, 584000, 820000],
    });
    expect(e.medianLatencyMs).toBeLessThan(20000);
    expect(e.avgLatencyMs).toBeGreaterThan(150000);
  });
});

describe("buildLeaderboards", () => {
  it("ranks by accuracy", () => {
    const [board] = buildLeaderboards([
      run({
        runId: "r1",
        entries: [
          entry({ modelId: "slow", accuracy: 61.3 }),
          entry({ modelId: "fast", accuracy: 86.3 }),
        ],
      }),
    ]);
    expect(board.rows.map((r) => r.modelId)).toEqual(["fast", "slow"]);
    expect(board.rows[0].rank).toBe(1);
    expect(board.rows[1].rank).toBe(2);
  });

  it("breaks accuracy ties on blunders, then on cost", () => {
    const [board] = buildLeaderboards([
      run({
        runId: "r1",
        entries: [
          entry({ modelId: "pricey", accuracy: 80, blunderRate: 5, costPerPosition: 0.01 }),
          entry({ modelId: "cheap", accuracy: 80, blunderRate: 5, costPerPosition: 0.001 }),
          entry({ modelId: "reckless", accuracy: 80, blunderRate: 20, costPerPosition: 0.0001 }),
        ],
      }),
    ]);
    expect(board.rows.map((r) => r.modelId)).toEqual(["cheap", "pricey", "reckless"]);
  });

  it("keeps runs on different position sets apart", () => {
    const boards = buildLeaderboards([
      run({ runId: "r1", entries: [entry({ modelId: "a" })] }),
      run({
        runId: "r2",
        set: { id: "core-v2", hash: "bbbb2222", positions: 200 },
        entries: [entry({ modelId: "a" })],
      }),
    ]);
    expect(boards).toHaveLength(2);
  });

  it("keeps assisted and blind apart — they are different measurements", () => {
    const boards = buildLeaderboards([
      run({ runId: "r1", mode: "assisted", entries: [entry({ modelId: "a" })] }),
      run({ runId: "r2", mode: "blind", entries: [entry({ modelId: "a" })] }),
    ]);
    expect(boards).toHaveLength(2);
    expect(new Set(boards.map((b) => b.condition.mode))).toEqual(new Set(["assisted", "blind"]));
  });

  it("keeps neutral and coached prompts apart", () => {
    const boards = buildLeaderboards([
      run({ runId: "r1", entries: [entry({ modelId: "a" })] }),
      run({
        runId: "r2",
        prompt: { version: "v1-coached", hash: "bf184887" },
        entries: [entry({ modelId: "a" })],
      }),
    ]);
    expect(boards).toHaveLength(2);
  });

  it("uses the newest result when a model is re-run under the same condition", () => {
    const [board] = buildLeaderboards([
      run({
        runId: "old",
        publishedAt: "2026-01-01T00:00:00.000Z",
        entries: [entry({ modelId: "a", accuracy: 50 })],
      }),
      run({
        runId: "new",
        publishedAt: "2026-06-01T00:00:00.000Z",
        entries: [entry({ modelId: "a", accuracy: 90 })],
      }),
    ]);
    expect(board.rows).toHaveLength(1);
    expect(board.rows[0].accuracy).toBe(90);
    expect(board.rows[0].runIds).toEqual(["new"]);
  });

  it("merges different models from separate runs of the same condition", () => {
    const [board] = buildLeaderboards([
      run({ runId: "r1", entries: [entry({ modelId: "a", accuracy: 90 })] }),
      run({ runId: "r2", entries: [entry({ modelId: "b", accuracy: 70 })] }),
    ]);
    expect(board.rows.map((r) => r.modelId)).toEqual(["a", "b"]);
  });

  it("returns nothing for no runs", () => {
    expect(buildLeaderboards([])).toEqual([]);
  });
});

describe("overlaps", () => {
  it("detects intervals that do not separate the models", () => {
    expect(overlaps([70, 90], [85, 95])).toBe(true);
    expect(overlaps([75.2, 95.1], [43.1, 78.0])).toBe(true);
  });

  it("detects a clean separation", () => {
    expect(overlaps([90, 95], [70, 80])).toBe(false);
  });

  it("treats touching intervals as overlapping", () => {
    expect(overlaps([80, 90], [90, 95])).toBe(true);
  });
});

describe("conditionKey", () => {
  it("distinguishes every dimension that makes scores incomparable", () => {
    const base = { setId: "s", setHash: "h", mode: "assisted", promptVersion: "v1-neutral" };
    const k = conditionKey(base);
    expect(conditionKey({ ...base, setHash: "other" })).not.toBe(k);
    expect(conditionKey({ ...base, mode: "blind" })).not.toBe(k);
    expect(conditionKey({ ...base, promptVersion: "v1-coached" })).not.toBe(k);
  });
});
