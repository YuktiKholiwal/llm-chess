import { Chess } from "chess.js";
import type { Color, MoveRecord, MoveQuality, Outcome, Scorecard } from "./types";

/** The legal SANs for a position, hoisted so streaming callers compute it once. */
export function legalSet(fen: string): Set<string> {
  return new Set(new Chess(fen).moves());
}

/** SAN-shaped tokens that are actually legal right now, in order of mention. */
export function candidatesInText(
  fen: string,
  text: string,
  precomputed?: Set<string>,
): string[] {
  const legal = precomputed ?? legalSet(fen);
  const found: string[] = [];
  const re = /\b(O-O-O|O-O|[KQRBN][a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?|[a-h]x?[a-h]?[1-8](?:=[QRBN])?[+#]?)\b/g;
  for (const m of text.matchAll(re)) {
    const san = m[1];
    if (legal.has(san) && !found.includes(san)) found.push(san);
  }
  return found;
}

export function sanToSquares(
  fen: string,
  san: string,
): { from: string; to: string } | null {
  const chess = new Chess(fen);
  const found = chess
    .moves({ verbose: true })
    .find((m) => m.san === san);
  return found ? { from: found.from, to: found.to } : null;
}

export function randomLegalMove(fen: string): string {
  const moves = new Chess(fen).moves();
  return moves[Math.floor(Math.random() * moves.length)];
}

export function outcomeOf(chess: Chess, plyCap: boolean): Outcome | null {
  if (chess.isCheckmate()) {
    // The side to move is the one that got mated.
    return chess.turn() === "w"
      ? { result: "0-1", reason: "Checkmate" }
      : { result: "1-0", reason: "Checkmate" };
  }
  if (chess.isStalemate()) return { result: "1/2-1/2", reason: "Stalemate" };
  if (chess.isInsufficientMaterial())
    return { result: "1/2-1/2", reason: "Insufficient material" };
  if (chess.isThreefoldRepetition())
    return { result: "1/2-1/2", reason: "Threefold repetition" };
  if (chess.isDraw()) return { result: "1/2-1/2", reason: "Fifty-move rule" };
  if (plyCap) return { result: "1/2-1/2", reason: "Move limit reached" };
  return null;
}

/** Lichess-style thresholds, applied to centipawn loss. */
export function classify(cpLoss: number, isOnlyMove: boolean): MoveQuality {
  if (isOnlyMove) return "forced";
  if (cpLoss <= 10) return "best";
  if (cpLoss < 50) return "good";
  if (cpLoss < 100) return "inaccuracy";
  if (cpLoss < 250) return "mistake";
  return "blunder";
}

export function scorecardFor(
  moves: MoveRecord[],
  color: Color,
  modelId: string,
): Scorecard {
  const mine = moves.filter((m) => m.color === color && !m.book);
  const graded = mine.filter((m) => typeof m.cpLoss === "number");
  const sum = (f: (m: MoveRecord) => number) =>
    mine.reduce((a, m) => a + f(m), 0);

  const withAccuracy = mine.filter((m) => typeof m.accuracy === "number");
  const withEvalErr = mine.filter((m) => typeof m.evalErrorPawns === "number");
  const claimed = mine.filter((m) => m.evalClaim !== undefined);

  return {
    modelId,
    color,
    moves: mine.length,
    // Mean of per-move accuracies. Reported to one decimal because the spread
    // between strong models is small enough that integers hide it.
    accuracy: withAccuracy.length
      ? Math.round(
          (withAccuracy.reduce((a, m) => a + (m.accuracy ?? 0), 0) /
            withAccuracy.length) * 10,
        ) / 10
      : 0,
    evalErrorPawns: withEvalErr.length
      ? Math.round(
          (withEvalErr.reduce((a, m) => a + (m.evalErrorPawns ?? 0), 0) /
            withEvalErr.length) * 100,
        ) / 100
      : 0,
    evalCompliance: claimed.length
      ? claimed.filter((m) => m.evalClaim !== null).length / claimed.length
      : 0,
    acpl: graded.length
      ? Math.round(
          graded.reduce((a, m) => a + (m.cpLoss ?? 0), 0) / graded.length,
        )
      : 0,
    blunders: mine.filter((m) => m.quality === "blunder").length,
    mistakes: mine.filter((m) => m.quality === "mistake").length,
    inaccuracies: mine.filter((m) => m.quality === "inaccuracy").length,
    bestMatches: mine.filter((m) => m.quality === "best").length,
    illegalAttempts: sum((m) => m.illegalAttempts.length),
    forcedMoves: mine.filter((m) => m.forced).length,
    avgThinkMs: mine.length ? Math.round(sum((m) => m.thinkMs) / mine.length) : 0,
    totalReasoningTokens: sum((m) => m.usage.reasoningTokens ?? 0),
    totalTokens: sum((m) => m.usage.totalTokens ?? 0),
  };
}

/** A short opening seed so repeated matches don't replay the same game. */
export const OPENING_BOOK: { name: string; moves: string[] }[] = [
  { name: "Open Game", moves: ["e4", "e5"] },
  { name: "Sicilian", moves: ["e4", "c5"] },
  { name: "French", moves: ["e4", "e6"] },
  { name: "Caro-Kann", moves: ["e4", "c6"] },
  { name: "Queen's Gambit", moves: ["d4", "d5", "c4"] },
  { name: "Indian Defence", moves: ["d4", "Nf6"] },
  { name: "English", moves: ["c4"] },
  { name: "Réti", moves: ["Nf3", "d5"] },
];
