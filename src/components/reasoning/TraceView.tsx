"use client";

import { useMemo, useState } from "react";
import type { Arrow } from "react-chessboard";
import { Board } from "@/components/Board";
import { sanToSquares } from "@/lib/chess-utils";
import type { Task, Trace, VerifiedClaim } from "@/reasoning/types";
import { ModelDot, Pct, VerdictPill } from "./bits";

/**
 * One puzzle, and what each model said about it.
 *
 * This is the view the summary rates are an average of, and the reason the
 * eval exists as more than a table: a model can play the solution move and
 * still tell you the rook on a8 is defended when it plainly is not. Reading
 * that in prose, beside the position it is wrong about, lands in a way a
 * percentage does not.
 *
 * Hovering a claim lights up the squares it is about, so the sentence and the
 * board are talking about the same thing without the reader translating
 * coordinates in their head.
 */

const SQUARE = /^[a-h][1-8]$/;

/** The squares a claim is about, for the hover highlight. */
function squaresOf(claim: VerifiedClaim, fen: string): string[] {
  const out: string[] = [];
  const { square, by, moves } = claim.detail as {
    square?: unknown;
    by?: unknown;
    moves?: unknown;
  };

  if (typeof square === "string" && SQUARE.test(square)) out.push(square);
  // `by` is a colour on most kinds and a square on `pinned`, where it names
  // the pinning piece. Only the latter is worth lighting up.
  if (typeof by === "string" && SQUARE.test(by)) out.push(by);

  // A line's moves are SAN from one of two readings of the position, and the
  // verifier picks between them by legality. The highlight only needs the
  // first move, so the cheap half of that test is enough here.
  if (Array.isArray(moves) && typeof moves[0] === "string") {
    const squares = sanToSquares(fen, moves[0]);
    if (squares) out.push(squares.from, squares.to);
  }

  return out;
}

/**
 * One structured field, printed flat. Values are whatever the extractor's
 * schema puts there, and a line claim's `assertion` is itself an object -- so
 * this recurses one level rather than letting `String()` turn it into
 * `[object Object]`, which is the shape of the field a reader most wants to
 * see.
 */
function formatValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(formatValue).join(" ");
  if (value !== null && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${k}:${formatValue(v)}`)
      .join(" ");
  }
  return String(value);
}

function uciSquares(uci: string | null): { from: string; to: string } | null {
  if (!uci || uci.length < 4) return null;
  return { from: uci.slice(0, 2), to: uci.slice(2, 4) };
}

function cpLoss(loss: number | null) {
  if (loss === null) return null;
  // Mate is mapped into the centipawn scale as a five-figure number upstream;
  // printing it raw would read as a hundred-and-ninety-pawn mistake.
  if (Math.abs(loss) >= 10000) return "lost a forced mate";
  return `−${loss}cp`;
}

export function TraceView({ task, traces }: { task: Task; traces: Trace[] }) {
  const [active, setActive] = useState(0);
  const [hovered, setHovered] = useState<string[] | null>(null);
  const trace = traces[active];

  const solution = uciSquares(task.solution_uci[0] ?? null);
  const played = uciSquares(trace?.move ?? null);

  const arrows = useMemo<Arrow[]>(() => {
    const out: Arrow[] = [];
    if (solution) {
      out.push({
        startSquare: solution.from,
        endSquare: solution.to,
        color: "#62c07399",
      });
    }
    // Only drawn when it differs from the solution, so an agreeing arrow is
    // not painted twice in two colours.
    if (played && (!solution || played.from !== solution.from || played.to !== solution.to)) {
      out.push({
        startSquare: played.from,
        endSquare: played.to,
        color: "#ff636999",
      });
    }
    return out;
  }, [solution, played]);

  const squareStyles = useMemo(() => {
    if (!hovered?.length) return undefined;
    return Object.fromEntries(
      hovered.map((sq) => [
        sq,
        { boxShadow: "inset 0 0 0 3px #52a8ff", borderRadius: "2px" },
      ]),
    );
  }, [hovered]);

  if (!trace) {
    return (
      <p className="rounded-xl border border-arena-border bg-arena-panel px-6 py-12 text-center text-[13px] text-arena-dim">
        No model attempted this puzzle.
      </p>
    );
  }

  const checkable = trace.trueCount + trace.falseCount;

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      {/* ------------------------------------------------------------ board */}
      <div className="lg:sticky lg:top-20 lg:self-start">
        <Board
          fen={task.fen}
          arrows={arrows}
          squareStyles={squareStyles}
          orientation={task.side_to_move === "b" ? "black" : "white"}
        />

        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11.5px] text-arena-faint">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded" style={{ background: "#62c073" }} />
            Solution
          </span>
          {played && (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded" style={{ background: "#ff6369" }} />
              {trace.solved ? "Played (same)" : "Played"}
            </span>
          )}
          <span>{task.side_to_move === "w" ? "White" : "Black"} to move</span>
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-arena-line pt-5 text-[12px]">
          <div>
            <dt className="text-arena-faint">Rating</dt>
            <dd className="mt-1 font-mono-arena tabular-nums text-arena-text">
              {task.rating}
              <span className="ml-1.5 text-arena-faint">({task.rating_band} band)</span>
            </dd>
          </div>
          <div>
            <dt className="text-arena-faint">Solution</dt>
            <dd className="mt-1 font-mono-arena text-arena-text">
              {task.solution_uci.join(" ") || "—"}
            </dd>
          </div>
          <div className="col-span-2">
            <dt className="text-arena-faint">Motifs</dt>
            <dd className="mt-1.5 flex flex-wrap gap-1.5">
              {task.themes.map((t) => (
                <span
                  key={t}
                  className="rounded border border-arena-border px-1.5 py-0.5 text-[10.5px] text-arena-dim"
                >
                  {t}
                </span>
              ))}
            </dd>
          </div>
          <div className="col-span-2">
            <dt className="text-arena-faint">FEN</dt>
            <dd className="mt-1 break-all font-mono-arena text-[10.5px] leading-relaxed text-arena-dim">
              {task.fen}
            </dd>
          </div>
        </dl>
      </div>

      {/* ----------------------------------------------------------- traces */}
      <div>
        <div role="tablist" aria-label="Model" className="flex flex-wrap gap-1.5">
          {traces.map((t, i) => (
            <button
              key={t.model}
              role="tab"
              type="button"
              aria-selected={i === active}
              onClick={() => {
                setActive(i);
                setHovered(null);
              }}
              className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-[12.5px] transition-colors ${
                i === active
                  ? "border-arena-edge bg-arena-panel-2 font-medium text-arena-text"
                  : "border-arena-border text-arena-faint hover:border-arena-edge hover:text-arena-dim"
              }`}
            >
              <ModelDot accent={t.accent} />
              {t.label}
              <span
                title={`${t.trueCount} true, ${t.falseCount} false`}
                className="font-mono-arena text-[10.5px] tabular-nums"
              >
                <span className="text-arena-good">{t.trueCount}</span>
                <span className="text-arena-faint">/</span>
                <span className="text-arena-bad">{t.falseCount}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-arena-border bg-arena-panel px-5 py-4 text-[12.5px]">
          <span
            className={`font-medium ${trace.solved ? "text-arena-good" : "text-arena-bad"}`}
          >
            {trace.solved ? "Solved" : trace.legal ? "Missed" : "No legal move"}
          </span>
          {trace.move && (
            <span className="text-arena-dim">
              Played <span className="font-mono-arena text-arena-text">{trace.move}</span>
              {cpLoss(trace.playedCpLoss) && (
                <span className="ml-1.5 text-arena-faint">
                  ({cpLoss(trace.playedCpLoss)})
                </span>
              )}
            </span>
          )}
          {checkable > 0 && (
            <span className="text-arena-dim">
              Claims true <Pct value={trace.claimAccuracy} dp={0} />
            </span>
          )}
          <span className="ml-auto font-mono-arena text-[11px] text-arena-faint tabular-nums">
            {trace.tokensOut} out · ${trace.costUsd.toFixed(4)} ·{" "}
            {(trace.latencyMs / 1000).toFixed(1)}s
          </span>
        </div>

        {trace.plan && (
          <div className="mt-5">
            <h2 className="mb-2 text-[10.5px] font-medium uppercase tracking-[0.09em] text-arena-faint">
              Stated plan
            </h2>
            <p className="border-l-2 border-arena-border pl-4 text-[13.5px] leading-[1.7] text-arena-dim">
              {trace.plan}
            </p>
            {trace.planMove && (
              <p className="mt-2 pl-4 text-[11.5px] text-arena-faint">
                Resolves to{" "}
                <span className="font-mono-arena text-arena-dim">{trace.planMove}</span>
                {cpLoss(trace.planMoveCpLoss) && <> · {cpLoss(trace.planMoveCpLoss)}</>}
              </p>
            )}
          </div>
        )}

        <div className="mt-8">
          <h2 className="mb-3 text-[10.5px] font-medium uppercase tracking-[0.09em] text-arena-faint">
            Reasoning
          </h2>
          <p className="whitespace-pre-wrap text-[13.5px] leading-[1.75] text-arena-dim">
            {trace.reasoning || "The model returned no reasoning."}
          </p>
        </div>

        <div className="mt-10">
          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <h2 className="text-[10.5px] font-medium uppercase tracking-[0.09em] text-arena-faint">
              Claims extracted from it
            </h2>
            <p className="font-mono-arena text-[11px] tabular-nums">
              <span className="text-arena-good">{trace.trueCount} true</span>
              <span className="text-arena-faint"> · </span>
              <span className="text-arena-bad">{trace.falseCount} false</span>
              <span className="text-arena-faint">
                {" "}
                · {trace.unverifiableCount} unverifiable
              </span>
            </p>
          </div>
          <p className="mb-4 text-[11.5px] leading-[1.6] text-arena-faint">
            Hover a claim to light up the squares it is about.
          </p>

          {trace.claims.length === 0 ? (
            <p className="rounded-xl border border-arena-border bg-arena-panel px-5 py-8 text-center text-[12.5px] text-arena-dim">
              No claims were extracted from this trace.
            </p>
          ) : (
            <ul
              onMouseLeave={() => setHovered(null)}
              className="rounded-xl border border-arena-border bg-arena-panel px-5"
            >
              {trace.claims.map((claim) => (
                <li
                  key={claim.claimId}
                  onMouseEnter={() => setHovered(squaresOf(claim, task.fen))}
                  className="border-b border-arena-line py-3.5 last:border-b-0"
                >
                  <div className="flex gap-3">
                    <VerdictPill verdict={claim.verdict} showLabel={false} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] leading-[1.6] text-arena-dim">
                        {claim.text}
                      </p>
                      <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 font-mono-arena text-[10.5px] text-arena-faint">
                        {claim.kind && <span className="text-arena-dim">{claim.kind}</span>}
                        {Object.entries(claim.detail)
                          .filter(([, v]) => v !== null && v !== undefined && v !== "")
                          .map(([k, v]) => (
                            <span key={k}>
                              {k}={formatValue(v)}
                            </span>
                          ))}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
