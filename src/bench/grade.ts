import { accuracyForMove, evalError } from "@/lib/accuracy";
import { classify } from "@/lib/chess-utils";
import type { MoveQuality } from "@/lib/types";
import type { BenchPosition } from "./positions";

/**
 * Grading is deliberately pure: the runner supplies the engine numbers, this
 * does only arithmetic. That keeps the scoring rules provable in isolation,
 * which matters more here than anywhere else in the codebase -- these are the
 * numbers the benchmark reports.
 */

export type Response = {
  /** The model's move in SAN, or null if it produced nothing parseable. */
  san: string | null;
  /** Whether that move is legal in the position. */
  legal: boolean;
  /** The model's own evaluation, centipawns from White, or null if omitted. */
  evalClaim: number | null;
  /** How many illegal moves it proposed before this answer. */
  illegalAttempts: number;
};

export type Grade = {
  /** Did it ultimately produce a legal move at all? */
  answered: boolean;
  /** Centipawns given up versus the engine's best move. Never negative. */
  cpLoss: number | null;
  /** 0-100 on the Lichess scale. */
  accuracy: number | null;
  /** Did it pick the engine's single best move? */
  top1: boolean;
  /** Was it among the engine's ranked moves for this position? */
  topK: boolean;
  quality: MoveQuality | null;
  /** Pawns of disagreement with the engine on who is winning. */
  evalErrorPawns: number | null;
  /** Whether an eval was supplied at all. */
  evalSupplied: boolean;
  illegalAttempts: number;
};

/**
 * @param cpAfter Engine evaluation of the position AFTER the model's move,
 *   centipawns from White's perspective. Null when the move was illegal or
 *   missing, in which case move quality is unscorable.
 */
export function grade(
  position: BenchPosition,
  response: Response,
  cpAfter: number | null,
): Grade {
  const answered = response.legal && response.san !== null;
  const mover: "w" | "b" = position.fen.split(" ")[1] === "b" ? "b" : "w";
  const sign = mover === "w" ? 1 : -1;

  const evalSupplied = response.evalClaim !== null;
  const evalErrorPawns = evalSupplied
    ? evalError(response.evalClaim as number, position.cp)
    : null;

  if (!answered || cpAfter === null) {
    return {
      answered,
      cpLoss: null,
      accuracy: null,
      top1: false,
      topK: false,
      quality: null,
      evalErrorPawns,
      evalSupplied,
      illegalAttempts: response.illegalAttempts,
    };
  }

  // Loss is measured from the mover's point of view and floored at zero: a
  // model cannot be credited for the engine's search being shallower here than
  // it was when the position was labelled.
  const cpLoss = Math.max(0, (position.cp - cpAfter) * sign);
  const top1 = response.san === position.best[0];
  const topK = position.best.includes(response.san as string);

  return {
    answered: true,
    cpLoss: Math.round(cpLoss),
    accuracy: accuracyForMove(position.cp, cpAfter, mover),
    top1,
    topK,
    quality: classify(cpLoss, position.legalCount === 1),
    evalErrorPawns,
    evalSupplied,
    illegalAttempts: response.illegalAttempts,
  };
}

export type CategoryScore = {
  category: string;
  n: number;
  /** Mean accuracy over answered positions, 0-100. */
  accuracy: number;
  /** Mean centipawn loss over answered positions. */
  acpl: number;
  top1Rate: number;
  topKRate: number;
  blunderRate: number;
  /** Share of positions where no legal move was produced at all. */
  failureRate: number;
  /** Mean pawns of disagreement with the engine, over supplied evals. */
  evalErrorPawns: number;
  evalCompliance: number;
  /** Mean illegal proposals per position. */
  illegalPerPosition: number;
};

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const round = (n: number, dp = 1) => Math.round(n * 10 ** dp) / 10 ** dp;

export function summarise(grades: Grade[], category = "all"): CategoryScore {
  const answered = grades.filter((g) => g.answered);
  const withEval = grades.filter((g) => g.evalSupplied);

  return {
    category,
    n: grades.length,
    accuracy: round(mean(answered.map((g) => g.accuracy ?? 0))),
    acpl: Math.round(mean(answered.map((g) => g.cpLoss ?? 0))),
    top1Rate: round(mean(grades.map((g) => (g.top1 ? 1 : 0))) * 100),
    topKRate: round(mean(grades.map((g) => (g.topK ? 1 : 0))) * 100),
    blunderRate: round(mean(answered.map((g) => (g.quality === "blunder" ? 1 : 0))) * 100),
    failureRate: round(mean(grades.map((g) => (g.answered ? 0 : 1))) * 100),
    evalErrorPawns: round(mean(withEval.map((g) => g.evalErrorPawns ?? 0)), 2),
    evalCompliance: round(mean(grades.map((g) => (g.evalSupplied ? 1 : 0))) * 100),
    illegalPerPosition: round(mean(grades.map((g) => g.illegalAttempts)), 2),
  };
}

/**
 * Bootstrap confidence interval for a mean. A leaderboard without error bars
 * invites over-reading small differences, so every headline number ships with
 * one.
 */
export function bootstrapCI(
  values: number[],
  opts: { iterations?: number; alpha?: number; seed?: number } = {},
): { mean: number; lo: number; hi: number } {
  const iterations = opts.iterations ?? 2000;
  const alpha = opts.alpha ?? 0.05;
  if (values.length === 0) return { mean: 0, lo: 0, hi: 0 };
  if (values.length === 1) return { mean: values[0], lo: values[0], hi: values[0] };

  // Deterministic PRNG so a reported interval can be reproduced exactly.
  let state = (opts.seed ?? 12345) >>> 0;
  const rand = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };

  const means: number[] = [];
  for (let i = 0; i < iterations; i++) {
    let sum = 0;
    for (let j = 0; j < values.length; j++) {
      sum += values[Math.floor(rand() * values.length)];
    }
    means.push(sum / values.length);
  }
  means.sort((a, b) => a - b);
  const lo = means[Math.floor((alpha / 2) * iterations)];
  const hi = means[Math.floor((1 - alpha / 2) * iterations)];
  return { mean: round(mean(values), 2), lo: round(lo, 2), hi: round(hi, 2) };
}
