import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import {
  positionPrompt,
  promptHash,
  retryPrompt,
  systemPrompt,
  toPgnLine,
} from "./prompt";

const COACHING = /HOW TO THINK|forcing moves|hanging pieces|king safe|develop and castle/i;

describe("prompt versions", () => {
  it("the neutral prompt contains no chess advice", () => {
    // This is the whole point of the variant: coaching would measure the
    // prompt author rather than the model, and helps weak models more.
    for (const color of ["w", "b"] as const) {
      for (const mode of ["assisted", "blind"] as const) {
        expect(systemPrompt(color, mode, "v1-neutral")).not.toMatch(COACHING);
      }
    }
  });

  it("the coached prompt does contain advice, so the delta is measurable", () => {
    expect(systemPrompt("w", "assisted", "v1-coached")).toMatch(COACHING);
  });

  it("both variants demand the same output contract", () => {
    for (const v of ["v1-neutral", "v1-coached"] as const) {
      const p = systemPrompt("w", "assisted", v);
      expect(p).toContain("<move>");
      expect(p).toContain("<eval>");
      expect(p).toContain("## Analysis");
    }
  });

  it("tells each side which colour it is", () => {
    expect(systemPrompt("w", "assisted", "v1-neutral")).toContain("as White");
    expect(systemPrompt("b", "assisted", "v1-neutral")).toContain("as Black");
  });

  it("only assisted mode promises a legal move list", () => {
    expect(systemPrompt("w", "assisted", "v1-neutral")).toContain("given the list of legal moves");
    expect(systemPrompt("w", "blind", "v1-neutral")).not.toContain("given the list of legal moves");
  });

  it("hashes are stable and distinguish variants", () => {
    expect(promptHash("v1-neutral")).toBe(promptHash("v1-neutral"));
    expect(promptHash("v1-neutral")).not.toBe(promptHash("v1-coached"));
  });

  it("hashes are frozen — changing these means old numbers are incomparable", () => {
    // Update deliberately, and treat it as a benchmark version bump.
    expect(promptHash("v1-neutral")).toBe("12750a8b");
    expect(promptHash("v1-coached")).toBe("bf184887");
  });
});

describe("positionPrompt", () => {
  const game = () => {
    const c = new Chess();
    for (const m of ["e4", "e5", "Nf3", "Nc6", "Bb5"]) c.move(m);
    return c;
  };

  it("carries the game history, which a FEN alone cannot supply", () => {
    const c = game();
    expect(positionPrompt(c.fen(), "assisted", c.history())).toContain(
      "Game so far: 1. e4 e5 2. Nf3 Nc6 3. Bb5",
    );
  });

  it("includes the FEN and a board diagram", () => {
    const c = game();
    const p = positionPrompt(c.fen(), "assisted", c.history());
    expect(p).toContain(c.fen());
    expect(p).toContain("Board (uppercase = White");
  });

  it("lists legal moves only in assisted mode", () => {
    const c = game();
    expect(positionPrompt(c.fen(), "assisted", c.history())).toContain("Legal moves");
    expect(positionPrompt(c.fen(), "blind", c.history())).not.toContain("Legal moves");
  });

  it("flags check", () => {
    const c = new Chess();
    for (const m of ["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6", "Qxf7+"]) c.move(m);
    expect(positionPrompt(c.fen(), "blind")).toContain("You are in check");
  });
});

describe("retryPrompt", () => {
  const c = new Chess();
  for (const m of ["e4", "e5", "Nf3", "Nc6", "Bb5"]) c.move(m);

  it("states the problem exactly once", () => {
    const p = retryPrompt(c.fen(), "Qd4", "Qd4 is not legal from this position.", "assisted");
    expect(p.match(/not (a )?legal/gi)).toHaveLength(1);
    expect(p).toContain('"Qd4"');
  });

  it("explains a missing tag as a formatting problem, not an illegal move", () => {
    const p = retryPrompt(c.fen(), "(no move)", "No <move> tag found.", "assisted");
    expect(p).toContain("did not contain a <move> tag");
    expect(p).not.toContain('"(no move)"');
  });

  it("withholds the legal list in blind mode", () => {
    expect(retryPrompt(c.fen(), "Qd4", "", "blind")).not.toContain("Legal moves");
  });
});

describe("toPgnLine", () => {
  it("numbers move pairs", () => {
    expect(toPgnLine(["e4", "e5", "Nf3"])).toBe("1. e4 e5 2. Nf3");
  });
});
