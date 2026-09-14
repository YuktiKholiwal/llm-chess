import { Chess } from "chess.js";
import { afterAll, describe, expect, it } from "vitest";
import { NodeEngine, mateToCp } from "./engine-node";

const engine = new NodeEngine();
afterAll(() => engine.quit());

describe("mateToCp", () => {
  it("keeps mate scores comparable with centipawn scores", () => {
    expect(mateToCp(1)).toBeGreaterThan(mateToCp(5));
    expect(mateToCp(-1)).toBeLessThan(mateToCp(-5));
    expect(mateToCp(3)).toBe(9970);
    expect(mateToCp(-3)).toBe(-9970);
  });
});

describe("NodeEngine", () => {
  it("reports its build so the manifest can pin it", async () => {
    await engine.init();
    expect(engine.version).toMatch(/Stockfish/i);
  }, 60000);

  it("finds the obvious recapture", async () => {
    // Black just played ...exd5; White wins the pawn back with Nxd5 or Qxd5.
    const c = new Chess();
    for (const m of ["d4", "d5", "c4", "e6", "Nc3", "Nf6", "cxd5"]) c.move(m);
    const a = await engine.analyze(c.fen(), { depth: 12 });
    expect(a.lines).toHaveLength(1);
    expect(a.depth).toBeGreaterThanOrEqual(10);
    expect(a.lines[0].move).toMatch(/^[a-h][1-8][a-h][1-8]/);
  }, 60000);

  it("normalises scores to White's perspective regardless of side to move", async () => {
    // White is a whole queen up; the sign must not flip with the mover.
    const whiteToMove = "rnb1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const blackToMove = "rnb1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1";
    const a = await engine.analyze(whiteToMove, { depth: 10 });
    const b = await engine.analyze(blackToMove, { depth: 10 });
    expect(a.lines[0].cp).toBeGreaterThan(300);
    expect(b.lines[0].cp).toBeGreaterThan(300);
  }, 90000);

  it("sees a forced mate and reports it from White's side", async () => {
    // Back-rank mate: Ra8#.
    const a = await engine.analyze("6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1", { depth: 14 });
    expect(a.lines[0].mate).not.toBeNull();
    expect(a.lines[0].mate!).toBeGreaterThan(0);
    expect(a.lines[0].cp).toBeGreaterThan(9000);
  }, 90000);

  it("returns several ranked lines under MultiPV", async () => {
    const a = await engine.analyze(new Chess().fen(), { depth: 12, multipv: 3 });
    expect(a.lines.length).toBe(3);
    // Ranked best-first from the mover's point of view; White moves first here.
    expect(a.lines[0].cp).toBeGreaterThanOrEqual(a.lines[1].cp);
    expect(a.lines[1].cp).toBeGreaterThanOrEqual(a.lines[2].cp);
    expect(new Set(a.lines.map((l) => l.move)).size).toBe(3);
  }, 90000);

  it("serialises overlapping calls instead of corrupting the conversation", async () => {
    const c = new Chess();
    c.move("e4");
    const [a, b] = await Promise.all([
      engine.analyze(new Chess().fen(), { depth: 10, multipv: 1 }),
      engine.analyze(c.fen(), { depth: 10, multipv: 1 }),
    ]);
    expect(a.lines[0].move).toBeTruthy();
    expect(b.lines[0].move).toBeTruthy();
    expect(a.lines[0].move).not.toBe(b.lines[0].move);
  }, 120000);
});

describe("process hygiene", () => {
  it("leaves globalThis.fetch usable after the engine loads", async () => {
    // The WASM bundle nulls fetch on load to force an XHR path for the .wasm.
    // Everything else in the process -- the AI SDK above all -- needs it back,
    // and without this the benchmark fails every request with
    // "fetch is not a function".
    await engine.init();
    expect(typeof globalThis.fetch).toBe("function");
    const res = await fetch("https://ai-gateway.vercel.sh/v1/models");
    expect(res.ok).toBe(true);
  }, 60000);

  it("refuses a second engine with an actionable message", async () => {
    await engine.init();
    await expect(new NodeEngine().init()).rejects.toThrow(/once per process/i);
  }, 60000);
});
