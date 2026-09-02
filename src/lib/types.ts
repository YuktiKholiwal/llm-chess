export type Color = "w" | "b";
export type Mode = "assisted" | "blind";

export type MoveQuality =
  | "best"
  | "good"
  | "inaccuracy"
  | "mistake"
  | "blunder"
  | "forced";

export type Usage = {
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
};

/** One completed ply, with everything needed to grade and replay it. */
export type MoveRecord = {
  ply: number;
  moveNumber: number;
  color: Color;
  san: string;
  modelId: string;
  fenBefore: string;
  fenAfter: string;
  analysis: string;
  reasoning: string;
  /** Illegal SANs the model proposed before landing on a legal one. */
  illegalAttempts: string[];
  retries: number;
  /** True when the loop gave up and played a random legal move. */
  forced: boolean;
  /** Opening-book seed move: shown for correct numbering, but no model chose
   * it, so it must never count toward anyone's scorecard. */
  book?: boolean;
  thinkMs: number;
  usage: Usage;
  /** Centipawns from White's perspective, filled in by the engine. */
  evalBefore?: number;
  evalAfter?: number;
  /** Centipawn loss from the mover's perspective. Always >= 0. */
  cpLoss?: number;
  bestMove?: string;
  quality?: MoveQuality;
};

export type MatchStatus =
  | "idle"
  | "thinking"
  | "paused"
  | "finished"
  | "error";

export type Outcome = {
  result: "1-0" | "0-1" | "1/2-1/2" | "*";
  reason: string;
};

/** Live streaming state for the player currently on move. */
export type LiveThought = {
  color: Color;
  modelId: string;
  analysis: string;
  reasoning: string;
  attempt: number;
  startedAt: number;
  candidates: string[];
};

export type Scorecard = {
  modelId: string;
  color: Color;
  moves: number;
  acpl: number;
  blunders: number;
  mistakes: number;
  inaccuracies: number;
  bestMatches: number;
  illegalAttempts: number;
  forcedMoves: number;
  avgThinkMs: number;
  totalReasoningTokens: number;
  totalTokens: number;
};
