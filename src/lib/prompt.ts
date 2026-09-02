import { Chess } from "chess.js";
import type { Color, Mode } from "./types";

/**
 * Byte-identical for both players apart from the side they're told to play and
 * the mode. Any per-model coaxing here would invalidate the comparison.
 */
export function systemPrompt(color: Color, mode: Mode): string {
  const side = color === "w" ? "White" : "Black";
  return `You are playing a serious competitive game of chess as ${side}.

Every move you make is graded against a strong chess engine, so play the
objectively strongest move you can find -- not the flashiest one.

HOW TO THINK
- Look at forcing moves first: checks, captures, and direct threats.
- For each candidate, ask what your opponent's best reply is. A move is only
  good if it survives the best answer to it.
- Watch for hanging pieces on BOTH sides, yours included, before committing.
- Keep your king safe. Do not open lines toward your own king for small gains.
- In the opening, develop and castle. In the endgame, push passed pawns and
  activate your king.

${
  mode === "assisted"
    ? "You will be given the complete list of legal moves. Your move MUST be one of them, copied exactly."
    : "You will NOT be given a list of legal moves. Track the position yourself from the FEN and the board diagram, and make sure your move is legal before you commit to it."
}

OUTPUT FORMAT -- follow this exactly, both sections, in this order:

## Analysis
Two to six sentences. Name your top candidate moves in SAN, state the main
tactical or positional point, and say briefly why you rejected the runners-up.

## Move
<move>SAN</move>

The <move> tag must contain exactly one legal move in Standard Algebraic
Notation and nothing else. Examples: <move>Nf3</move>, <move>exd5</move>,
<move>O-O</move>, <move>Qxh7#</move>, <move>e8=Q+</move>.`;
}

export function positionPrompt(
  fen: string,
  mode: Mode,
  /** SAN moves played so far. A Chess rebuilt from a FEN has no history of its
   * own, so the caller must supply it or the model plays each move blind to
   * how the game got here. */
  history: string[] = [],
): string {
  const chess = new Chess(fen);
  const color: Color = chess.turn();
  const legal = chess.moves();

  const parts = [
    `Position (FEN): ${fen}`,
    `You are: ${color === "w" ? "White" : "Black"}`,
    `Move number: ${chess.moveNumber()}`,
    "",
    "Board (uppercase = White, lowercase = Black):",
    chess.ascii(),
  ];

  if (history.length) {
    parts.push("", `Game so far: ${toPgnLine(history)}`);
  }

  if (chess.inCheck()) {
    parts.push("", "You are IN CHECK. You must address the check this move.");
  }

  if (mode === "assisted") {
    parts.push(
      "",
      `Legal moves (${legal.length}) -- your answer must be one of these, copied exactly:`,
      legal.join(" "),
    );
  }

  parts.push("", "Give your ## Analysis, then your ## Move.");
  return parts.join("\n");
}

/** Renders history back into a numbered move line for context. */
export function toPgnLine(history: string[]): string {
  const out: string[] = [];
  let n = 1;
  for (let i = 0; i < history.length; i++) {
    if (i % 2 === 0) out.push(`${n++}.`);
    out.push(history[i]);
  }
  return out.join(" ");
}

export function retryPrompt(
  fen: string,
  bad: string,
  reason: string,
  mode: Mode,
): string {
  const chess = new Chess(fen);
  const legal = chess.moves();
  const lines = [
    `"${bad}" is not a legal move in this position. ${reason}`,
    "",
    "Look at the board again carefully.",
  ];
  if (mode === "assisted") {
    lines.push("", `Legal moves (${legal.length}):`, legal.join(" "));
  } else {
    lines.push(
      "",
      `Board:`,
      chess.ascii(),
      "",
      "Re-derive which of your pieces can actually reach the square you want.",
    );
  }
  lines.push(
    "",
    "Reply again in the same format (## Analysis, then ## Move) with a legal move.",
  );
  return lines.join("\n");
}
