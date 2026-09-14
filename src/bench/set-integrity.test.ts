import { existsSync, readFileSync } from "node:fs";
import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import { verifySet, type PositionSet } from "./positions";

const SET_PATH = "bench/sets/core-v1.json";

/**
 * Properties the shipped position set must hold. A benchmark whose test set
 * quietly drifts -- in contents, or in the balance of what it asks -- produces
 * numbers that cannot be compared across runs.
 */
describe.skipIf(!existsSync(SET_PATH))("shipped position set", () => {
  const set = existsSync(SET_PATH)
    ? (JSON.parse(readFileSync(SET_PATH, "utf8")) as PositionSet)
    : ({ positions: [] } as unknown as PositionSet);

  it("matches its recorded content hash", () => {
    const check = verifySet(set);
    expect(check.actual).toBe(check.expected);
  });

  it("contains only legal, undecided positions with a real choice", () => {
    for (const p of set.positions) {
      const c = new Chess(p.fen);
      expect(c.isGameOver()).toBe(false);
      expect(c.moves().length).toBeGreaterThan(1);
      expect(p.legalCount).toBe(c.moves().length);
    }
  });

  it("labels every position with moves that are legal there", () => {
    for (const p of set.positions) {
      const legal = new Chess(p.fen).moves();
      for (const san of p.best) expect(legal).toContain(san);
    }
  });

  it("is not skewed to one side to move", () => {
    // Sampling at a fixed ply stride locks parity and therefore colour; this is
    // the regression guard for that bug.
    const white = set.positions.filter((p) => p.fen.split(" ")[1] === "w").length;
    const share = white / set.positions.length;
    expect(share).toBeGreaterThan(0.3);
    expect(share).toBeLessThan(0.7);
  });

  it("covers every category", () => {
    const seen = new Set(set.positions.map((p) => p.category));
    for (const c of ["tactical", "positional", "blunder-avoidance", "endgame"]) {
      expect(seen).toContain(c);
    }
  });

  it("excludes already-decided positions, which measure nothing", () => {
    for (const p of set.positions) expect(Math.abs(p.cp)).toBeLessThanOrEqual(800);
  });

  it("has no duplicate positions", () => {
    expect(new Set(set.positions.map((p) => p.id)).size).toBe(set.positions.length);
  });
});
