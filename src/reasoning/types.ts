/**
 * Shapes of the reasoning eval's on-disk artifacts, as the web app reads them.
 *
 * The pipeline is Python and writes JSONL; these types are a transcription of
 * that contract, not a second source of truth. If a stage changes its output,
 * this file is what has to follow it -- nothing here should ever be the reason
 * a field exists.
 */

/** How a claim was classified before verification. */
export type ClaimType = "state" | "line" | "best_move" | "unverifiable" | "none";

/** The structured form the extractor must produce for every claim. */
export type ClaimKind =
  | "attacked"
  | "best_move"
  | "castling_rights"
  | "check"
  | "controls_square"
  | "defended"
  | "hanging"
  | "line"
  | "material"
  | "mate_in"
  | "passed_pawn"
  | "piece_on_square"
  | "pinned"
  | "unverifiable";

/** One Lichess puzzle. `data/tasks.jsonl` */
export type Task = {
  id: string;
  fen: string;
  side_to_move: "w" | "b";
  solution_uci: string[];
  rating: number;
  rating_band: number;
  themes: string[];
};

/** One model's attempt at one task. `data/runs.jsonl` */
export type Run = {
  task_id: string;
  model: string;
  reasoning: string;
  hidden_thinking: string | null;
  plan: string | null;
  move: string | null;
  legal: boolean;
  retries: number;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  latency_ms: number;
  error: string | null;
  prompt_version: string;
  prompt_hash: string;
};

/** One assertion pulled out of a reasoning trace. `data/claims.jsonl` */
export type Claim = {
  task_id: string;
  model: string;
  claim_id: number;
  text: string;
  type: ClaimType;
  subject: string;
  structured: ({ kind: ClaimKind } & Record<string, unknown>) | null;
};

/** The engine's verdict on one claim. `data/verified.jsonl` */
export type Verified = {
  task_id: string;
  model: string;
  claim_id: number;
  type: ClaimType;
  /** True, false, or null where the claim could not be checked at all. */
  verdict: boolean | null;
  played_move: string | null;
  played_cp_loss: number | null;
  plan_move: string | null;
  plan_move_cp_loss: number | null;
};

/* --------------------------------------------------------------- scores */

/** One row of `data/results.json` -- a model scored over some slice of tasks. */
export type ScoreRow = {
  scope: string;
  model: string;
  label: string;
  tasks: number;
  verified_tasks: number;
  solve_rate: number;
  solve_rate_ci: [number, number];
  claim_accuracy: number | null;
  claim_accuracy_ci: [number, number];
  reasoning_outcome_gap: number | null;
  unverifiable_rate: number;
  claims_true: number;
  claims_false: number;
  claims_unverifiable: number;
  claims_per_task: number;
  /** State and line claims scored apart: describing a board and calculating a
   * variation are different abilities, and one figure hides which a model has. */
  state_accuracy: number | null;
  state_accuracy_ci: [number, number];
  state_claims: number;
  line_accuracy: number | null;
  line_accuracy_ci: [number, number];
  line_claims: number;
  plan_cp_loss_median: number | null;
  played_cp_loss_median: number | null;
  /** Share of resolved plans losing less than 100cp against the engine's best. */
  plan_sound_rate: number | null;
  /** Share of plans that named their own move rather than needing a resolver.
   * Read `consistency` only against this -- where a plan names no move, the
   * resolver's mistakes read as the model contradicting itself. */
  plan_named_rate: number;
  plan_resolved_rate: number;
  consistency: number | null;
  illegal_rate: number;
  extraction_failure_rate: number;
  cost_per_task: number;
  total_cost_usd: number;
};

export type Results = {
  generated_at: string;
  commit: string;
  engine_depth: number;
  extractor: string;
  overall: ScoreRow[];
  by_band: ScoreRow[];
  by_theme: ScoreRow[];
};

/* ---------------------------------------------------------------- joined */

/** A claim with the engine's verdict attached. */
export type VerifiedClaim = {
  claimId: number;
  text: string;
  type: ClaimType;
  kind: ClaimKind | null;
  /** The structured form, minus `kind`, for display as key/value pairs. */
  detail: Record<string, unknown>;
  verdict: boolean | null;
};

/**
 * Everything the app needs about one model's attempt at one puzzle, joined
 * across all four pipeline stages on `(task_id, model)`.
 */
export type Trace = {
  taskId: string;
  model: string;
  label: string;
  accent: string;
  reasoning: string;
  plan: string | null;
  /** The move played, in UCI. Null where nothing parseable came back. */
  move: string | null;
  legal: boolean;
  solved: boolean;
  playedCpLoss: number | null;
  planMove: string | null;
  planMoveCpLoss: number | null;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  latencyMs: number;
  claims: VerifiedClaim[];
  trueCount: number;
  falseCount: number;
  unverifiableCount: number;
  /** true / (true + false), or null where nothing was checkable. */
  claimAccuracy: number | null;
};

/** A puzzle with every model's attempt at it. */
export type TaskTraces = {
  task: Task;
  traces: Trace[];
};

/**
 * One row of the trace browser. Deliberately narrow: the browser filters 600
 * of these in the client, and shipping the reasoning prose with them would
 * send about three megabytes to do it.
 */
export type TraceSummary = {
  taskId: string;
  model: string;
  label: string;
  rating: number;
  band: number;
  themes: string[];
  solved: boolean;
  claimAccuracy: number | null;
  trueCount: number;
  falseCount: number;
  unverifiableCount: number;
  /** First line of the reasoning, for a preview. */
  excerpt: string;
};
