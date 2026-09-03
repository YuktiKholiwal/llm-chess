import { Chess } from "chess.js";
import { hashText } from "./hash";
import type { Color, Mode } from "./types";

/**
 * Prompts are FROZEN and VERSIONED. A benchmark number is meaningless without
 * knowing which prompt produced it, so every variant carries a content hash
 * that is stamped onto each move record and into the run manifest.
 *
 * Changing the text of an existing version invalidates every comparison made
 * against it. Add a new version instead.
 */
export { hashText };

export type PromptVersion = "v1-neutral" | "v1-coached";

export const DEFAULT_PROMPT_VERSION: PromptVersion = "v1-neutral";



const OUTPUT_CONTRACT = `Output format -- exactly these three sections, in this order:

## Analysis
Your reasoning.

## Evaluation
<eval>N.N</eval>

A single number in pawns, from White's point of view: positive means White is
better, negative means Black is better, 0.0 is level. Use M3 for "mate in 3 for
White" and -M3 for "mate in 3 for Black".

## Move
<move>SAN</move>

Exactly one legal move in Standard Algebraic Notation, nothing else.
Examples: <move>Nf3</move>, <move>exd5</move>, <move>O-O</move>,
<move>Qxh7#</move>, <move>e8=Q+</move>.`;

function modeLine(mode: Mode): string {
  return mode === "assisted"
    ? "You will be given the list of legal moves. Your move must be one of them, copied exactly."
    : "You will not be given a list of legal moves. Determine legality yourself from the position.";
}

/**
 * NEUTRAL: states the task and the output contract, and says nothing whatsoever
 * about how to play. Chess advice here would measure the prompt author's skill
 * rather than the model's, and would help weak models more than strong ones --
 * compressing, and potentially inverting, the scale.
 */
function neutral(color: Color, mode: Mode): string {
  return `You are playing chess as ${color === "w" ? "White" : "Black"}.

Given the position below, choose the move you consider strongest.

${modeLine(mode)}

${OUTPUT_CONTRACT}`;
}

/**
 * COACHED: the neutral prompt plus explicit strategic scaffolding. Retained as
 * a named condition so prompt sensitivity is measurable -- the coached-minus-
 * neutral delta says how much a model gains from being told how to think.
 */
function coached(color: Color, mode: Mode): string {
  return `You are playing a serious competitive game of chess as ${color === "w" ? "White" : "Black"}.

Choose the objectively strongest move you can find.

HOW TO THINK
- Look at forcing moves first: checks, captures, and direct threats.
- For each candidate, ask what your opponent's best reply is. A move is only
  good if it survives the best answer to it.
- Watch for hanging pieces on BOTH sides, yours included, before committing.
- Keep your king safe. Do not open lines toward your own king for small gains.
- In the opening, develop and castle. In the endgame, push passed pawns and
  activate your king.

${modeLine(mode)}

${OUTPUT_CONTRACT}`;
}

export function systemPrompt(
  color: Color,
  mode: Mode,
  version: PromptVersion = DEFAULT_PROMPT_VERSION,
): string {
  return version === "v1-coached" ? coached(color, mode) : neutral(color, mode);
}

/**
 * Identity of a prompt variant, independent of which side is to move -- both
 * colours and both modes are hashed together so the hash covers the whole
 * variant rather than a single rendering of it.
 */
export function promptHash(version: PromptVersion): string {
  const all = (["w", "b"] as Color[])
    .flatMap((c) =>
      (["assisted", "blind"] as Mode[]).map((m) => systemPrompt(c, m, version)),
    )
    .join(" ");
  return hashText(all);
}

export const PROMPT_VERSIONS: {
  version: PromptVersion;
  label: string;
  description: string;
}[] = [
  {
    version: "v1-neutral",
    label: "Neutral",
    description: "Task and output format only, no strategic guidance.",
  },
  {
    version: "v1-coached",
    label: "Coached",
    description: "Adds strategic scaffolding, for measuring prompt sensitivity.",
  },
];

export function positionPrompt(
  fen: string,
  mode: Mode,
  /**
   * SAN moves played so far. A Chess rebuilt from a FEN has no history of its
   * own, so the caller must supply it or the model plays each move blind to
   * how the game got here.
   */
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
    parts.push("", "You are in check.");
  }

  if (mode === "assisted") {
    parts.push("", `Legal moves (${legal.length}):`, legal.join(" "));
  }

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
  const noMove = bad === "(no move)" || !bad;

  // The caller's reason usually restates "not legal"; only append it when it
  // actually adds information, so the retry doesn't read as duplicated noise.
  const adds = reason && !/not (a )?legal|is not legal/i.test(reason);

  const lines = noMove
    ? ["Your last reply did not contain a <move> tag, so no move was recorded."]
    : [`"${bad}" is not a legal move in this position.`];
  if (adds) lines.push(reason);

  if (mode === "assisted") {
    lines.push("", `Legal moves (${legal.length}):`, legal.join(" "));
  } else {
    lines.push("", "Board:", chess.ascii());
  }
  lines.push(
    "",
    "Reply again in the same format (## Analysis, ## Evaluation, ## Move).",
  );
  return lines.join("\n");
}
