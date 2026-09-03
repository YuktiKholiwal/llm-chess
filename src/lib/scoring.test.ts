import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import {
  accuracyForMove,
  describeEval,
  evalError,
  moveAccuracy,
  winPercent,
} from "./accuracy";
import {
  candidatesInText,
  classify,
  outcomeOf,
  sanToSquares,
  scorecardFor,
} from "./chess-utils";
import { costOf, formatTokens, formatUsd } from "./cost";
import { OPERA_GAME, demoAnalysis, demoMove, materialEval, plausibleIllegal, plyFromFen } from "./demo";
import type { MoveRecord } from "./types";

const mk = (p: Partial<MoveRecord>): MoveRecord => ({
  ply: 1,
  moveNumber: 1,
  color: "w",
  san: "e4",
  modelId: "m",
  fenBefore: "",
  fenAfter: "",
  analysis: "",
  reasoning: "",
  illegalAttempts: [],
  retries: 0,
  forced: false,
  thinkMs: 1000,
  usage: {},
  ...p,
});

describe("accuracy", () => {
  it("is 50% at a level position", () => {
    expect(winPercent(0)).toBeCloseTo(50, 1);
  });

  it("rises with White's advantage", () => {
    expect(winPercent(300)).toBeGreaterThan(70);
    expect(winPercent(-300)).toBeLessThan(30);
  });

  it("scores a move that loses nothing near 100", () => {
    expect(moveAccuracy(60, 60)).toBeGreaterThanOrEqual(99);
  });

  it("barely penalises a small slip but collapses on a blunder", () => {
    expect(moveAccuracy(60, 57)).toBeGreaterThan(85);
    expect(moveAccuracy(60, 20)).toBeLessThan(30);
  });

  it("stays within 0-100", () => {
    expect(accuracyForMove(0, -5000, "w")).toBeGreaterThanOrEqual(0);
    expect(accuracyForMove(0, 0, "w")).toBeLessThanOrEqual(100);
  });

  it("reads evals from the mover's point of view", () => {
    // Black gaining 300cp is the mirror of White gaining 300cp.
    expect(accuracyForMove(0, -300, "b")).toBeCloseTo(accuracyForMove(0, 300, "w"), 6);
  });
});

describe("describeEval", () => {
  it.each([
    [10, "Level position", null],
    [60, "White is slightly better", "w"],
    [-600, "Black is completely winning", "b"],
  ])("describes %i", (cp, startsWith, leader) => {
    const d = describeEval(cp as number);
    expect(d.text).toContain(startsWith as string);
    expect(d.leader).toBe(leader);
  });

  it("calls out forced mate", () => {
    expect(describeEval(9970).text).toContain("forced mate");
  });
});

describe("classify", () => {
  it.each([
    [5, false, "best"],
    [70, false, "inaccuracy"],
    [150, false, "mistake"],
    [400, false, "blunder"],
    [900, true, "forced"],
  ])("cpLoss %i -> %s", (loss, only, expected) => {
    expect(classify(loss as number, only as boolean)).toBe(expected);
  });
});

describe("scorecardFor", () => {
  const moves: MoveRecord[] = [
    mk({ ply: 1, color: "w", san: "e4", book: true, modelId: "book", cpLoss: 400, quality: "blunder", accuracy: 10 }),
    mk({ ply: 2, color: "b", san: "e6", book: true, modelId: "book", cpLoss: 300, quality: "blunder", accuracy: 10 }),
    mk({ ply: 3, color: "w", san: "d4", cpLoss: 10, quality: "best", accuracy: 99, usage: { totalTokens: 100 } }),
    mk({ ply: 4, color: "b", san: "d5", cpLoss: 200, quality: "mistake", accuracy: 60, usage: { totalTokens: 50 } }),
  ];

  it("never blames a model for opening-book moves it did not choose", () => {
    const w = scorecardFor(moves, "w", "m");
    expect(w.moves).toBe(1);
    expect(w.blunders).toBe(0);
    expect(w.acpl).toBe(10);
    expect(w.accuracy).toBe(99);
    expect(w.totalTokens).toBe(100);
  });

  it("scores each colour separately", () => {
    const b = scorecardFor(moves, "b", "m");
    expect(b.moves).toBe(1);
    expect(b.acpl).toBe(200);
    expect(b.accuracy).toBe(60);
  });

  it("tracks how often the model supplied a parseable eval", () => {
    const withClaims = [
      mk({ ply: 3, color: "w", evalClaim: 50, evalErrorPawns: 0.5 }),
      mk({ ply: 5, color: "w", evalClaim: null }),
    ];
    const s = scorecardFor(withClaims, "w", "m");
    expect(s.evalCompliance).toBe(0.5);
    expect(s.evalErrorPawns).toBe(0.5);
  });
});

describe("evalError", () => {
  it("reports disagreement in pawns", () => {
    expect(evalError(120, -80)).toBeCloseTo(2.0, 6);
  });
});

describe("chess utils", () => {
  const start = new Chess().fen();

  it("keeps only candidate moves that are actually legal", () => {
    // Qh5 is blocked by the e2 pawn from the start position.
    expect(candidatesInText(start, "I considered Nf3, e4, and Qh5.")).toEqual(["Nf3", "e4"]);
  });

  it("keeps a candidate once it becomes legal", () => {
    const c = new Chess();
    c.move("e4");
    c.move("e5");
    expect(candidatesInText(c.fen(), "Qh5 attacks f7.")).toEqual(["Qh5"]);
  });

  it("maps SAN to squares for board arrows", () => {
    expect(sanToSquares(start, "e4")).toEqual({ from: "e2", to: "e4" });
  });

  it("detects checkmate, stalemate and the ply cap", () => {
    const fools = new Chess();
    for (const m of ["f3", "e5", "g4", "Qh4#"]) fools.move(m);
    expect(outcomeOf(fools, false)).toEqual({ result: "0-1", reason: "Checkmate" });
    expect(outcomeOf(new Chess("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1"), false)).toEqual({
      result: "1/2-1/2",
      reason: "Stalemate",
    });
    expect(outcomeOf(new Chess(), true)?.reason).toBe("Move limit reached");
  });
});

describe("cost", () => {
  const pricing = { m: { input: 0.000001, output: 0.000005 } };

  it("prices input and output separately", () => {
    expect(costOf([mk({ usage: { inputTokens: 1000, outputTokens: 1000 } })], pricing)).toBeCloseTo(0.006, 9);
  });

  it("charges nothing for book moves or unpriced models", () => {
    expect(costOf([mk({ book: true, usage: { inputTokens: 1e6 } })], pricing)).toBe(0);
    expect(costOf([mk({ modelId: "nope", usage: { inputTokens: 1e6 } })], pricing)).toBe(0);
  });

  it.each([
    [0.0042, "$0.0042"],
    [0.42, "$0.420"],
    [4.2, "$4.20"],
  ])("formats %f", (n, s) => expect(formatUsd(n as number)).toBe(s));

  it("abbreviates token counts", () => {
    expect(formatTokens(14500)).toBe("14.5k");
    expect(formatTokens(950)).toBe("950");
  });
});

describe("demo player", () => {
  it("derives the ply index from the FEN, not from history()", () => {
    const c = new Chess();
    expect(plyFromFen(c.fen())).toBe(0);
    c.move("e4");
    expect(plyFromFen(c.fen())).toBe(1);
    c.move("e5");
    expect(plyFromFen(c.fen())).toBe(2);
  });

  it("replays the whole Opera Game to checkmate", () => {
    const c = new Chess();
    const played: string[] = [];
    while (!c.isGameOver() && played.length < 200) {
      c.move(demoMove(c.fen()));
      played.push(c.history().at(-1)!);
    }
    expect(played).toEqual(OPERA_GAME);
    expect(c.isCheckmate()).toBe(true);
  });

  it("writes commentary that names the move it played", () => {
    const c = new Chess();
    let named = 0;
    for (const san of OPERA_GAME) {
      const text = demoAnalysis(c.fen(), san);
      expect(text.length).toBeGreaterThan(40);
      if (text.includes(san)) named++;
      c.move(san);
    }
    expect(named).toBeGreaterThanOrEqual(OPERA_GAME.length - 4);
  });

  it("produces a genuinely illegal move for the retry path", () => {
    const c = new Chess();
    for (const san of OPERA_GAME) {
      expect(new Chess(c.fen()).moves()).not.toContain(plausibleIllegal(c.fen()));
      c.move(san);
    }
  });

  it("counts material honestly", () => {
    expect(materialEval(new Chess().fen())).toBe(0);
    const c = new Chess();
    for (const m of ["e4", "d5", "exd5"]) c.move(m);
    expect(materialEval(c.fen())).toBe(100);
  });
});
