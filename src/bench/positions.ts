import { Chess } from "chess.js";
import { hashText } from "@/lib/hash";

/**
 * A frozen set of positions is the benchmark's test set. Like the prompt, it
 * is content-hashed: two scores are only comparable if they were produced
 * against the same set, and the hash is what proves it.
 */

export type PositionCategory =
  /** One move is far better than the rest -- rewards calculation. */
  | "tactical"
  /** Several moves are close -- rewards judgment. */
  | "positional"
  /** Even among the engine's top moves the evaluation falls away sharply, so
   * only a few replies hold -- rewards care rather than calculation. */
  | "blunder-avoidance"
  /** Few pieces left -- rewards technique. */
  | "endgame";

export type BenchPosition = {
  /** Stable id derived from the position itself, so sets can be merged safely. */
  id: string;
  fen: string;
  category: PositionCategory;
  /** Engine's ranked moves in SAN at generation time, best first. */
  best: string[];
  /** Engine evaluation, centipawns from White's perspective. */
  cp: number;
  /**
   * Centipawn gap between the best and second-best move, from the mover's
   * point of view. Large means one move stands out -- the definition of a
   * tactical position.
   */
  gap: number;
  /** Number of legal moves; a rough proxy for how constrained the choice is. */
  legalCount: number;
  /** How deep into a game the position arose. */
  ply: number;
};

export type PositionSet = {
  id: string;
  /** ISO timestamp of generation. */
  generatedAt: string;
  /** Engine build and search depth used to label the positions. */
  engine: string;
  depth: number;
  multipv: number;
  positions: BenchPosition[];
  /** Content hash of the positions. Changing any position changes this. */
  hash: string;
};

/** Positions are identified by their FEN, ignoring move counters. */
export function positionId(fen: string): string {
  return hashText(fen.split(" ").slice(0, 4).join(" "));
}

/**
 * Hash over the fields that define the question being asked. Deliberately
 * excludes generation metadata so re-labelling with a deeper search produces a
 * different hash -- because it is, in fact, a different test.
 */
export function hashPositions(positions: BenchPosition[]): string {
  const canonical = positions
    .map((p) => `${p.id}|${p.fen}|${p.category}|${p.best.join(",")}|${p.cp}|${p.gap}`)
    .sort()
    .join("\n");
  return hashText(canonical);
}

export function makeSet(
  id: string,
  positions: BenchPosition[],
  meta: { engine: string; depth: number; multipv: number },
): PositionSet {
  return {
    id,
    generatedAt: new Date().toISOString(),
    engine: meta.engine,
    depth: meta.depth,
    multipv: meta.multipv,
    positions,
    hash: hashPositions(positions),
  };
}

/** Rejects a set whose contents no longer match its recorded hash. */
export function verifySet(set: PositionSet): { ok: boolean; expected: string; actual: string } {
  const actual = hashPositions(set.positions);
  return { ok: actual === set.hash, expected: set.hash, actual };
}

/**
 * Classifies a position from its engine lines. `gap` is measured from the
 * mover's point of view, so the same thresholds apply to both colours.
 */
export function classifyPosition(
  fen: string,
  lines: { cp: number }[],
  opts: { tacticalGap?: number; positionalGap?: number; blunderDrop?: number } = {},
): PositionCategory {
  const tacticalGap = opts.tacticalGap ?? 150;
  const positionalGap = opts.positionalGap ?? 40;
  // Measured across the ranked lines supplied. With a wide MultiPV this asks
  // "do most reasonable-looking moves already lose?", which is discriminative.
  // With a narrow one every line is good and it would never fire.
  const blunderDrop = opts.blunderDrop ?? 300;

  const chess = new Chess(fen);
  const pieces = chess
    .board()
    .flat()
    .filter(Boolean).length;
  if (pieces <= 10) return "endgame";

  const sign = chess.turn() === "w" ? 1 : -1;
  const fromMover = lines.map((l) => l.cp * sign);
  const best = fromMover[0] ?? 0;
  const second = fromMover[1] ?? best;
  const worst = fromMover[fromMover.length - 1] ?? best;

  if (best - second >= tacticalGap) return "tactical";
  if (best - worst >= blunderDrop) return "blunder-avoidance";
  if (best - second <= positionalGap) return "positional";
  return "positional";
}

/** Converts a UCI move to SAN in the given position, or null if illegal. */
export function uciToSan(fen: string, uci: string): string | null {
  const chess = new Chess(fen);
  const found = chess
    .moves({ verbose: true })
    .find((m) => m.from + m.to + (m.promotion ?? "") === uci || m.from + m.to === uci);
  return found?.san ?? null;
}
