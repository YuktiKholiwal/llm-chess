import { describe, expect, it } from "vitest";
import { lastByColor, reviewAt, stepPly } from "./review";
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

const GAME = [
  mk({ ply: 1, color: "w", san: "e4", fenAfter: "fen1", evalAfter: 20 }),
  mk({ ply: 2, color: "b", san: "e5", fenAfter: "fen2", evalAfter: 10 }),
  mk({ ply: 3, color: "w", san: "Nf3", fenAfter: "fen3", evalAfter: 35 }),
  mk({ ply: 4, color: "b", san: "Nc6", fenAfter: "fen4" }),
];

describe("reviewAt", () => {
  it("follows the live game when nothing is selected", () => {
    const v = reviewAt(GAME, null, "live-fen");
    expect(v.ply).toBeNull();
    expect(v.fen).toBe("live-fen");
    expect(v.through).toHaveLength(4);
  });

  it("rewinds the board to the selected move", () => {
    expect(reviewAt(GAME, 2, "live-fen").fen).toBe("fen2");
  });

  it("truncates the move slice, so panels and scorecards rewind too", () => {
    const v = reviewAt(GAME, 2, "live-fen");
    expect(v.through.map((m) => m.san)).toEqual(["e4", "e5"]);
  });

  it("falls back to live when the selection no longer exists", () => {
    // What a reset looks like: the ply is still selected, the moves are gone.
    const v = reviewAt([], 3, "start-fen");
    expect(v.ply).toBeNull();
    expect(v.fen).toBe("start-fen");
  });

  it("holds the last graded evaluation while the engine catches up", () => {
    // Ply 4 is ungraded; the bar should show ply 3's number, not level.
    expect(reviewAt(GAME, 4, "live-fen").cp).toBe(35);
  });

  it("reads zero before anything has been graded", () => {
    expect(reviewAt([mk({ ply: 1 })], 1, "live-fen").cp).toBe(0);
  });
});

describe("lastByColor", () => {
  it("finds that side's move at or before the reviewed ply", () => {
    const { through } = reviewAt(GAME, 3, "live-fen");
    expect(lastByColor(through, "w")?.san).toBe("Nf3");
    expect(lastByColor(through, "b")?.san).toBe("e5");
  });

  it("is null before that side has moved", () => {
    const { through } = reviewAt(GAME, 1, "live-fen");
    expect(lastByColor(through, "b")).toBeNull();
  });
});

describe("stepPly", () => {
  it("enters review on the final move when stepping back from live", () => {
    expect(stepPly(GAME, null, -1)).toBe(4);
  });

  it("stays live when stepping forward from live", () => {
    expect(stepPly(GAME, null, 1)).toBeNull();
  });

  it("walks backwards and forwards", () => {
    expect(stepPly(GAME, 3, -1)).toBe(2);
    expect(stepPly(GAME, 3, 1)).toBe(4);
  });

  it("stops at the first move rather than wrapping", () => {
    expect(stepPly(GAME, 1, -1)).toBe(1);
  });

  it("returns to live when stepping past the last move", () => {
    expect(stepPly(GAME, 4, 1)).toBeNull();
  });

  it("has nowhere to go in an empty game", () => {
    expect(stepPly([], null, -1)).toBeNull();
  });
});
