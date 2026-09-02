import { Chess } from "chess.js";
import type { Usage } from "./types";

/**
 * Offline demo player. Makes NO API calls: it replays a real master game and
 * fabricates commentary from facts actually computed off the position, so the
 * whole UI (streaming, candidate arrows, retry badges, engine grading) can be
 * exercised without a gateway key. Clearly labelled as scripted in the UI --
 * this is never presented as real model output.
 */
export const DEMO_PREFIX = "demo/";
export const isDemo = (modelId: string) => modelId.startsWith(DEMO_PREFIX);

/**
 * Morphy vs. Duke of Brunswick & Count Isouard, Paris 1858 -- "the Opera Game".
 * Chosen because it is short, decisive, and Black's play is bad enough that
 * Stockfish will light up the move list with real mistakes and blunders.
 */
export const OPERA_GAME = [
  "e4", "e5", "Nf3", "d6", "d4", "Bg4", "dxe5", "Bxf3", "Qxf3", "dxe5",
  "Bc4", "Nf6", "Qb3", "Qe7", "Nc3", "c6", "Bg5", "b5", "Nxb5", "cxb5",
  "Bxb5+", "Nbd7", "O-O-O", "Rd8", "Rxd7", "Rxd7", "Rd1", "Qe6", "Bxd7+",
  "Nxd7", "Qb8+", "Nxb8", "Rd8#",
];

/**
 * Half-moves elapsed, read off the FEN. A Chess built from a FEN has an empty
 * history(), so the fullmove counter and side to move are the only reliable
 * source for "how far into the game are we".
 */
export function plyFromFen(fen: string): number {
  const [, turn, , , , fullmove] = fen.split(" ");
  return (Number(fullmove || 1) - 1) * 2 + (turn === "b" ? 1 : 0);
}

/** The scripted move if it still fits the position, else a sane legal move. */
export function demoMove(fen: string): string {
  const chess = new Chess(fen);
  const played = plyFromFen(fen);
  const scripted = OPERA_GAME[played];
  const legal = chess.moves();
  if (scripted && legal.includes(scripted)) return scripted;

  // Diverged (e.g. after a manual reset): prefer a capture, then a developing
  // move, then anything legal.
  const verbose = chess.moves({ verbose: true });
  const capture = verbose.find((m) => m.captured);
  if (capture) return capture.san;
  const develop = verbose.find((m) => "nb".includes(m.piece) && m.from[1] !== m.to[1]);
  return develop?.san ?? legal[0];
}

/** A syntactically valid SAN that is illegal here, to exercise the retry path. */
export function plausibleIllegal(fen: string): string {
  const chess = new Chess(fen);
  const legal = new Set(chess.moves());
  const files = "abcdefgh";
  for (const piece of ["N", "B", "Q", "R"]) {
    for (let i = 0; i < 24; i++) {
      const san = `${piece}${files[i % 8]}${((i * 3) % 8) + 1}`;
      if (!legal.has(san)) return san;
    }
  }
  return "Qz9";
}

function facts(fen: string, san: string) {
  const chess = new Chess(fen);
  const move = chess.moves({ verbose: true }).find((m) => m.san === san);
  const names: Record<string, string> = {
    p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king",
  };
  const alts = chess
    .moves()
    .filter((m) => m !== san)
    .slice(0, 12);
  // Prefer interesting-looking alternatives to name as rejected candidates.
  const ranked = [
    ...alts.filter((m) => m.includes("x")),
    ...alts.filter((m) => m.includes("+")),
    ...alts.filter((m) => /^[NBRQ]/.test(m)),
    ...alts,
  ];
  return {
    piece: move ? names[move.piece] : "piece",
    to: move?.to ?? "",
    capture: Boolean(move?.captured),
    captured: move?.captured ? names[move.captured] : "",
    check: san.includes("+"),
    mate: san.includes("#"),
    castle: san.startsWith("O-O"),
    moveNumber: chess.moveNumber(),
    inCheck: chess.inCheck(),
    alts: [...new Set(ranked)].slice(0, 2),
  };
}

/** Commentary assembled from real properties of the position. */
export function demoAnalysis(fen: string, san: string): string {
  const f = facts(fen, san);
  const alt = f.alts[0] ? `${f.alts[0]}` : null;
  const alt2 = f.alts[1] ? `${f.alts[1]}` : null;
  const lines: string[] = [];

  if (f.mate) {
    lines.push(`**${san}** is mate. The king has no flight squares and nothing interposes, so the game ends here.`);
  } else if (f.inCheck) {
    lines.push(`I'm in check, so the reply set is forced. **${san}** deals with it${f.capture ? ` by taking the ${f.captured}` : ""} while keeping the position together.`);
  } else if (f.castle) {
    lines.push(`Time to castle. **${san}** tucks the king away and connects the rooks, which matters more than grabbing material here.`);
  } else if (f.capture) {
    lines.push(`**${san}** wins the ${f.captured} on ${f.to}. I checked the recapture and the resulting trade favours me${f.check ? ", and it comes with check" : ""}.`);
  } else if (f.moveNumber <= 8) {
    lines.push(`Still in the opening. **${san}** develops the ${f.piece} toward ${f.to} and fights for the centre rather than committing to a plan too early.`);
  } else if (f.check) {
    lines.push(`**${san}** gives check, forcing the reply and letting me pick up a tempo before the opponent can consolidate.`);
  } else {
    lines.push(`**${san}** improves the ${f.piece} on ${f.to}, adding pressure while keeping my structure intact.`);
  }

  if (alt) {
    lines.push(
      alt2
        ? `I also looked at **${alt}** and **${alt2}**, but both let the opponent equalise after the obvious reply.`
        : `**${alt}** was the main alternative; it looked tempting but runs into the natural answer.`,
    );
  }
  return lines.join(" ");
}

export function demoReasoning(fen: string, san: string): string {
  const f = facts(fen, san);
  return [
    `Scanning forcing moves first.`,
    f.alts.length ? `Candidates: ${[san, ...f.alts].join(", ")}.` : `Candidate: ${san}.`,
    f.capture ? `${san} takes on ${f.to} — checking whether the recapture costs me anything.` : `${san} is quiet; verifying nothing of mine hangs afterwards.`,
    `No back-rank issues. Committing to ${san}.`,
  ].join("\n");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Roughly a fast reading pace; a full ply streams in about two seconds. */
const CHARS_PER_SEC = 220;
const TICK_MS = 40;

/** Streams the canned text at a human-ish cadence. */
export async function runDemoPly(
  fen: string,
  attempt: number,
  onDelta: (kind: "text" | "reasoning", v: string) => void,
  signal?: AbortSignal,
): Promise<{
  legal: boolean;
  san: string | null;
  error: string | null;
  analysis: string;
  reasoning: string;
  usage: Usage;
  // Present so the demo shares the exact shape of a real ply result.
  transient?: boolean;
  fatal?: string;
}> {
  const played = plyFromFen(fen);
  // Fake exactly one illegal attempt mid-game so the retry UI is visible.
  const shouldFail = attempt === 0 && played === 12;
  const san = shouldFail ? plausibleIllegal(fen) : demoMove(fen);

  const reasoning = demoReasoning(fen, shouldFail ? demoMove(fen) : san);
  const analysis = shouldFail
    ? `I think ${san} is strong here, hitting the weak square before the opponent can cover it.`
    : demoAnalysis(fen, san);

  await sleep(300 + Math.random() * 400);
  await emit(reasoning, "reasoning", CHARS_PER_SEC, onDelta, signal);
  await sleep(120);
  const full = `## Analysis\n${analysis}\n\n## Move\n<move>${san}</move>`;
  await emit(full, "text", CHARS_PER_SEC, onDelta, signal);

  const legal = !shouldFail;
  return {
    legal,
    san,
    error: legal ? null : `${san} is not legal from this position.`,
    analysis,
    reasoning,
    usage: {
      inputTokens: 600 + played * 12,
      outputTokens: Math.round(full.length / 4),
      reasoningTokens: Math.round(reasoning.length / 4),
      totalTokens: 600 + played * 12 + Math.round((full.length + reasoning.length) / 4),
    },
  };
}

/**
 * Emits text at a fixed characters-per-second rate driven by the clock rather
 * than by one timer per chunk. Background tabs clamp setTimeout to roughly one
 * call per second; because each tick emits however much the elapsed time earns,
 * the stream still finishes in about the right wall-clock time either way.
 */
async function emit(
  text: string,
  kind: "text" | "reasoning",
  charsPerSec: number,
  onDelta: (kind: "text" | "reasoning", v: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const started = performance.now();
  let sent = 0;
  while (sent < text.length) {
    if (signal?.aborted) return;
    await sleep(TICK_MS);
    const earned = Math.floor(((performance.now() - started) / 1000) * charsPerSec);
    const target = Math.min(text.length, Math.max(earned, sent + 1));
    if (target > sent) {
      onDelta(kind, text.slice(sent, target));
      sent = target;
    }
  }
}
