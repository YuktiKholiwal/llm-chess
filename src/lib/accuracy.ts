/**
 * Converts engine centipawns into numbers a non-player can read.
 *
 * ACPL is the right internal statistic but a terrible headline: "ACPL 32"
 * means nothing to most people, while "94% accurate" is immediately legible.
 * The mapping below is Lichess's published one, so the number is comparable
 * with a scale players already know rather than being invented here.
 */

/** Probability-of-winning for the side to move, 0-100, from centipawns. */
export function winPercent(cp: number): number {
  const clamped = Math.max(-1000, Math.min(1000, cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * clamped)) - 1);
}

/**
 * Accuracy for a single move, 0-100, from the drop in winning chances it
 * caused. Losing 2% of your winning chances barely dents accuracy; losing 40%
 * of it collapses the score.
 */
export function moveAccuracy(winBefore: number, winAfter: number): number {
  const drop = Math.max(0, winBefore - winAfter);
  const raw = 103.1668 * Math.exp(-0.04354 * drop) - 3.1669;
  return Math.max(0, Math.min(100, raw));
}

/**
 * Accuracy for one played move. Evals arrive from White's perspective, so they
 * are flipped for Black before being read as "my winning chances".
 */
export function accuracyForMove(
  evalBefore: number,
  evalAfter: number,
  color: "w" | "b",
): number {
  const sign = color === "w" ? 1 : -1;
  return moveAccuracy(winPercent(evalBefore * sign), winPercent(evalAfter * sign));
}

/** Plain-language reading of a position, for people who don't read eval bars. */
export function describeEval(cp: number): { text: string; leader: "w" | "b" | null } {
  const abs = Math.abs(cp);
  if (abs >= 9000) {
    return { text: cp > 0 ? "White has forced mate" : "Black has forced mate", leader: cp > 0 ? "w" : "b" };
  }
  const leader = abs < 30 ? null : cp > 0 ? "w" : "b";
  const who = cp > 0 ? "White" : "Black";
  const pawns = (abs / 100).toFixed(1);

  if (abs < 30) return { text: "Level position", leader: null };
  if (abs < 90) return { text: `${who} is slightly better`, leader };
  if (abs < 200) return { text: `${who} is better (+${pawns})`, leader };
  if (abs < 500) return { text: `${who} is clearly winning (+${pawns})`, leader };
  return { text: `${who} is completely winning (+${pawns})`, leader };
}

/** How far a model's own position assessment was from the engine's, in pawns. */
export function evalError(claimCp: number, engineCp: number): number {
  const cap = (n: number) => Math.max(-1500, Math.min(1500, n));
  return Math.abs(cap(claimCp) - cap(engineCp)) / 100;
}
