import { describe, expect, it } from "vitest";
import { extractAnalysis, parseEval, parseMove } from "./parse-move";

describe("parseMove", () => {
  it("reads the tagged move", () => {
    expect(parseMove("## Analysis\nCentre.\n\n## Move\n<move>Nf3</move>")).toBe("Nf3");
  });

  it.each([
    ["<move> e4 </move>", "e4"],
    ["**<move>O-O</move>**", "O-O"],
    ["<move>e8=Q+</move>", "e8=Q+"],
    ["<move>exd5</move>", "exd5"],
    ["<move>Qxh7#</move>", "Qxh7#"],
    ["<move>Nbd2</move>", "Nbd2"],
    ["<move>O-O-O</move>", "O-O-O"],
  ])("handles %s", (input, expected) => {
    expect(parseMove(input)).toBe(expected);
  });

  it("takes the last tag when the model changes its mind", () => {
    expect(parseMove("<move>e4</move> wait, no. <move>d4</move>")).toBe("d4");
  });

  it("does not mistake moves named in the analysis for the answer", () => {
    const text = "## Analysis\nNf3 and Bc4 are options, Bc4 tempting.\n\n## Move\n<move>Nf3</move>";
    expect(parseMove(text)).toBe("Nf3");
  });

  it("falls back to a bare move under the heading", () => {
    expect(parseMove("## Analysis\nBc4 looks nice.\n\n## Move\nNf3")).toBe("Nf3");
  });

  it("returns null when there is no move at all", () => {
    expect(parseMove("I resign, this is hopeless.")).toBeNull();
  });
});

describe("parseEval", () => {
  it.each([
    ["<eval>+1.2</eval>", 120],
    ["<eval>-0.5</eval>", -50],
    ["<eval>0.0</eval>", 0],
    ["<eval>2</eval>", 200],
    ["<eval>M3</eval>", 9970],
    ["<eval>-M3</eval>", -9970],
  ])("parses %s", (input, expected) => {
    expect(parseEval(input)).toBe(expected);
  });

  it("falls back to the Evaluation heading", () => {
    expect(parseEval("## Evaluation\n+0.7\n\n## Move")).toBe(70);
  });

  it("records a missing tag as null rather than guessing", () => {
    expect(parseEval("## Analysis\nno eval here")).toBeNull();
  });

  it("rejects a value that is obviously centipawns, not pawns", () => {
    expect(parseEval("<eval>320</eval>")).toBeNull();
  });

  it("takes the last tag", () => {
    expect(parseEval("<eval>1.0</eval> hmm <eval>-2.0</eval>")).toBe(-200);
  });

  it("coexists with the move tag", () => {
    const text = "## Evaluation\n<eval>0.3</eval>\n\n## Move\n<move>Nf3</move>";
    expect(parseEval(text)).toBe(30);
    expect(parseMove(text)).toBe("Nf3");
  });
});

describe("extractAnalysis", () => {
  it("keeps only the prose before the move", () => {
    expect(extractAnalysis("## Analysis\nCentre control.\n\n## Move\n<move>e4</move>")).toBe(
      "Centre control.",
    );
  });
});
