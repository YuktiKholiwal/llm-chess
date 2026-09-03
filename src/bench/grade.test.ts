import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import { bootstrapCI, grade, summarise, type Grade } from "./grade";
import {
  classifyPosition,
  hashPositions,
  makeSet,
  positionId,
  uciToSan,
  verifySet,
  type BenchPosition,
} from "./positions";

const whiteToMove: BenchPosition = {
  id: "p1",
  fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 3",
  category: "positional",
  best: ["Nc3", "Bc4", "d4"],
  cp: 30,
  gap: 20,
  legalCount: 29,
  ply: 4,
};

const blackToMove: BenchPosition = {
  ...whiteToMove,
  id: "p2",
  fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2",
  best: ["Nc6", "Nf6", "d6"],
  cp: 40,
};

const res = (o: Partial<Parameters<typeof grade>[1]> = {}) => ({
  san: "Nc3",
  legal: true,
  evalClaim: null,
  illegalAttempts: 0,
  ...o,
});

describe("grade", () => {
  it("scores a move that keeps the evaluation as near-perfect", () => {
    const g = grade(whiteToMove, res(), 28);
    expect(g.answered).toBe(true);
    expect(g.cpLoss).toBe(2);
    expect(g.accuracy!).toBeGreaterThan(95);
    expect(g.top1).toBe(true);
    expect(g.topK).toBe(true);
    expect(g.quality).toBe("best");
  });

  it("charges White for a drop in White's evaluation", () => {
    const g = grade(whiteToMove, res({ san: "Ng5" }), -270);
    expect(g.cpLoss).toBe(300);
    expect(g.quality).toBe("blunder");
    expect(g.top1).toBe(false);
    expect(g.topK).toBe(false);
  });

  it("charges Black for a RISE in White's evaluation", () => {
    // The sign must flip with the mover, or Black is scored backwards.
    const g = grade(blackToMove, res({ san: "Qh4" }), 340);
    expect(g.cpLoss).toBe(300);
    expect(g.quality).toBe("blunder");
  });

  it("never reports a negative loss when the model outplays the label", () => {
    const g = grade(whiteToMove, res(), 500);
    expect(g.cpLoss).toBe(0);
    expect(g.quality).toBe("best");
  });

  it("recognises a non-best move that is still in the ranked set", () => {
    const g = grade(whiteToMove, res({ san: "Bc4" }), 20);
    expect(g.top1).toBe(false);
    expect(g.topK).toBe(true);
  });

  it("marks an illegal answer unscorable rather than scoring it zero", () => {
    const g = grade(whiteToMove, res({ san: "Nf6", legal: false }), null);
    expect(g.answered).toBe(false);
    expect(g.cpLoss).toBeNull();
    expect(g.accuracy).toBeNull();
    expect(g.quality).toBeNull();
  });

  it("treats a missing move the same way", () => {
    const g = grade(whiteToMove, res({ san: null, legal: false }), null);
    expect(g.answered).toBe(false);
  });

  it("still scores the eval claim even when the move was illegal", () => {
    // Judgment and move choice are separate capabilities; one failing should
    // not silently discard the other's measurement.
    const g = grade(whiteToMove, res({ san: null, legal: false, evalClaim: 130 }), null);
    expect(g.evalSupplied).toBe(true);
    expect(g.evalErrorPawns).toBeCloseTo(1.0, 6);
  });

  it("records a missing eval as not supplied rather than as zero error", () => {
    const g = grade(whiteToMove, res(), 28);
    expect(g.evalSupplied).toBe(false);
    expect(g.evalErrorPawns).toBeNull();
  });

  it("marks a position with one legal move as forced", () => {
    const g = grade({ ...whiteToMove, legalCount: 1 }, res(), -900);
    expect(g.quality).toBe("forced");
  });

  it("carries illegal attempts through", () => {
    expect(grade(whiteToMove, res({ illegalAttempts: 2 }), 28).illegalAttempts).toBe(2);
  });
});

describe("summarise", () => {
  const g = (o: Partial<Grade>): Grade => ({
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

  it("averages only over positions that were actually answered", () => {
    const s = summarise([
      g({ accuracy: 100, cpLoss: 0 }),
      g({ answered: false, accuracy: null, cpLoss: null }),
    ]);
    expect(s.n).toBe(2);
    expect(s.accuracy).toBe(100);
    expect(s.failureRate).toBe(50);
  });

  it("reports rates as percentages of all positions", () => {
    const s = summarise([g({ top1: true, topK: true }), g({}), g({ topK: true }), g({})]);
    expect(s.top1Rate).toBe(25);
    expect(s.topKRate).toBe(50);
  });

  it("measures eval compliance separately from eval error", () => {
    const s = summarise([
      g({ evalSupplied: true, evalErrorPawns: 1 }),
      g({ evalSupplied: true, evalErrorPawns: 3 }),
      g({ evalSupplied: false, evalErrorPawns: null }),
    ]);
    expect(s.evalCompliance).toBeCloseTo(66.7, 1);
    expect(s.evalErrorPawns).toBe(2);
  });

  it("counts blunders among answered positions", () => {
    const s = summarise([g({ quality: "blunder" }), g({ quality: "best" })]);
    expect(s.blunderRate).toBe(50);
  });
});

describe("bootstrapCI", () => {
  it("brackets the mean", () => {
    const ci = bootstrapCI([90, 92, 88, 91, 89, 93, 87, 90]);
    expect(ci.lo).toBeLessThanOrEqual(ci.mean);
    expect(ci.hi).toBeGreaterThanOrEqual(ci.mean);
    expect(ci.mean).toBeCloseTo(90, 0);
  });

  it("is deterministic, so a published interval can be reproduced", () => {
    const xs = [70, 95, 60, 88, 91, 45, 99, 80];
    expect(bootstrapCI(xs)).toEqual(bootstrapCI(xs));
  });

  it("widens with noisier data", () => {
    const tight = bootstrapCI([90, 90, 91, 90, 90, 91, 90, 90]);
    const loose = bootstrapCI([10, 99, 40, 95, 20, 88, 5, 100]);
    expect(loose.hi - loose.lo).toBeGreaterThan(tight.hi - tight.lo);
  });

  it("handles degenerate inputs", () => {
    expect(bootstrapCI([])).toEqual({ mean: 0, lo: 0, hi: 0 });
    expect(bootstrapCI([42])).toEqual({ mean: 42, lo: 42, hi: 42 });
  });
});

describe("position sets", () => {
  it("identifies positions ignoring move counters", () => {
    const a = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const b = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 9 40";
    expect(positionId(a)).toBe(positionId(b));
  });

  it("hashes contents independent of ordering", () => {
    const p2 = { ...whiteToMove, id: "p2" };
    expect(hashPositions([whiteToMove, p2])).toBe(hashPositions([p2, whiteToMove]));
  });

  it("changes the hash when any position changes", () => {
    const before = hashPositions([whiteToMove]);
    expect(hashPositions([{ ...whiteToMove, best: ["d4"] }])).not.toBe(before);
    expect(hashPositions([{ ...whiteToMove, cp: 31 }])).not.toBe(before);
  });

  it("verifies a set against its recorded hash", () => {
    const set = makeSet("t", [whiteToMove], { engine: "sf", depth: 14, multipv: 3 });
    expect(verifySet(set).ok).toBe(true);
    const tampered = { ...set, positions: [{ ...whiteToMove, cp: 999 }] };
    expect(verifySet(tampered).ok).toBe(false);
  });

  it("converts UCI to SAN", () => {
    expect(uciToSan(new Chess().fen(), "e2e4")).toBe("e4");
    expect(uciToSan(new Chess().fen(), "e2e5")).toBeNull();
  });
});

describe("classifyPosition", () => {
  const mid = "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 3";

  it("calls a position tactical when one move stands far above the rest", () => {
    expect(classifyPosition(mid, [{ cp: 300 }, { cp: 100 }, { cp: 90 }])).toBe("tactical");
  });

  it("calls it positional when the top moves are close", () => {
    expect(classifyPosition(mid, [{ cp: 30 }, { cp: 20 }, { cp: 15 }])).toBe("positional");
  });

  it("flags blunder-avoidance when a legal move loses badly", () => {
    expect(classifyPosition(mid, [{ cp: 30 }, { cp: 10 }, { cp: -400 }])).toBe(
      "blunder-avoidance",
    );
  });

  it("classifies by material count before anything else", () => {
    expect(classifyPosition("6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1", [{ cp: 900 }, { cp: 100 }])).toBe(
      "endgame",
    );
  });

  it("applies the same thresholds to Black", () => {
    // Black to move, Black's best is 300cp better from Black's point of view.
    const black = "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2";
    expect(classifyPosition(black, [{ cp: -300 }, { cp: -100 }, { cp: -90 }])).toBe("tactical");
  });
});
