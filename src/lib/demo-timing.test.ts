import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import { runDemoPly } from "./demo";

describe("demo ply timing", () => {
  it("streams and completes a ply in a couple of seconds", async () => {
    const started = Date.now();
    let textChars = 0;
    let reasoningChars = 0;
    const out = await runDemoPly(new Chess().fen(), 0, (kind, v) => {
      if (kind === "text") textChars += v.length;
      else reasoningChars += v.length;
    });
    const elapsed = Date.now() - started;

    expect(out.legal).toBe(true);
    expect(out.san).toBe("e4");
    expect(out.evalClaim).toBe(0);
    expect(textChars).toBeGreaterThan(50);
    expect(reasoningChars).toBeGreaterThan(20);
    // Wall-clock driven, so it must not drift into the tens of seconds.
    expect(elapsed).toBeLessThan(8000);
  }, 20000);

  it("emits a genuinely illegal move on the scripted retry ply", async () => {
    const c = new Chess();
    for (let i = 0; i < 12; i++) c.move(c.moves()[0]);
    const out = await runDemoPly(c.fen(), 0, () => {});
    expect(out.legal).toBe(false);
    expect(new Chess(c.fen()).moves()).not.toContain(out.san);
  }, 20000);

  it("aborts promptly when signalled", async () => {
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 200);
    const started = Date.now();
    await runDemoPly(new Chess().fen(), 0, () => {}, ac.signal);
    expect(Date.now() - started).toBeLessThan(4000);
  }, 20000);
});
