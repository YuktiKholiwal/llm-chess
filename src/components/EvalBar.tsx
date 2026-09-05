"use client";

import { describeEval, winPercent } from "@/lib/accuracy";

/**
 * Vertical white-advantage bar, plus the same information in words. The bar
 * alone is meaningless to anyone who hasn't used a chess engine before, and
 * this app is meant to be readable by people who don't play.
 */
export function EvalBar({ cp, active }: { cp: number; active: boolean }) {
  const pct = Math.max(2, Math.min(98, winPercent(cp)));
  const { leader } = describeEval(cp);
  const label = Math.abs(cp) >= 9000 ? (cp > 0 ? "M" : "-M") : (cp / 100).toFixed(1);

  return (
    <div className="flex h-full flex-col items-center gap-2">
      <div
        className={`relative w-[18px] flex-1 overflow-hidden rounded-full border border-arena-border bg-arena-panel-2 transition-opacity ${
          active ? "opacity-100" : "opacity-30"
        }`}
        title={
          active
            ? "Who is winning, according to Stockfish"
            : "Turn on Stockfish grading to see this"
        }
      >
        <div
          className="absolute bottom-0 w-full bg-arena-text transition-all duration-500 ease-out"
          style={{ height: `${pct}%` }}
        />
        <div className="absolute top-1/2 h-px w-full bg-arena-faint/40" />
      </div>
      <span
        className={`font-mono-arena text-[11px] tabular-nums ${
          leader === null ? "text-arena-faint" : "text-arena-dim"
        }`}
      >
        {cp > 0 ? "+" : ""}
        {label}
      </span>
    </div>
  );
}

/** The headline read on the position, in plain English. */
export function EvalSummary({ cp, active }: { cp: number; active: boolean }) {
  if (!active) {
    return (
      <p className="text-[12.5px] text-arena-faint">
        Stockfish grading is off — turn it on to see who is winning.
      </p>
    );
  }
  const { text, leader } = describeEval(cp);
  return (
    <p className="flex items-center gap-2 text-[13px] font-medium tracking-[-0.01em] text-arena-text">
      <span
        className="h-2.5 w-2.5 rounded-full border border-arena-edge"
        style={{
          background:
            leader === "w" ? "#ededed" : leader === "b" ? "#1a1a1a" : "transparent",
        }}
      />
      {text}
    </p>
  );
}
