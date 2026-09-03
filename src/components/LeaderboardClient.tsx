"use client";

import { useMemo, useState } from "react";
import { overlaps, type LeaderboardRow, type LeaderboardView } from "@/bench/leaderboard";
import { getModel } from "@/lib/models";

type SortKey = "accuracy" | "acpl" | "top1Rate" | "blunderRate" | "evalErrorPawns" | "costPerPosition";

const COLUMNS: {
  key: SortKey;
  label: string;
  help: string;
  /** Lower is better. */
  asc?: boolean;
  format: (r: LeaderboardRow) => string;
}[] = [
  {
    key: "acpl",
    label: "ACPL",
    help: "Average centipawn loss — how much evaluation the model gave up per move versus Stockfish's best. Lower is better.",
    asc: true,
    format: (r) => String(r.acpl),
  },
  {
    key: "top1Rate",
    label: "Top-1",
    help: "How often the model chose the engine's single best move.",
    format: (r) => `${r.top1Rate}%`,
  },
  {
    key: "blunderRate",
    label: "Blunders",
    help: "Share of moves that threw away a winning or level position.",
    asc: true,
    format: (r) => `${r.blunderRate}%`,
  },
  {
    key: "evalErrorPawns",
    label: "Eval err",
    help: "How far the model's own assessment of the position was from Stockfish's, in pawns. Measures judgment, separately from move choice.",
    asc: true,
    format: (r) => `${r.evalErrorPawns.toFixed(2)}p`,
  },
  {
    key: "costPerPosition",
    label: "$/pos",
    help: "Estimated cost per position at AI Gateway list rates.",
    asc: true,
    format: (r) => `$${r.costPerPosition.toFixed(4)}`,
  },
];

/**
 * Accuracy with its confidence interval drawn as a whisker. The bar alone
 * invites over-reading a two-point gap; the interval shows when the data does
 * not actually separate two models.
 */
function AccuracyBar({ row, accent }: { row: LeaderboardRow; accent: string }) {
  const [lo, hi] = row.accuracyCI;
  const pct = (v: number) => Math.max(0, Math.min(100, v));

  return (
    <div className="flex items-center gap-2.5">
      <span className="w-[52px] shrink-0 text-right font-[family-name:var(--font-mono-arena)] text-[14px] font-semibold tabular-nums">
        {row.accuracy.toFixed(1)}%
      </span>
      <div className="relative hidden h-5 min-w-[120px] flex-1 sm:block">
        <div className="absolute inset-y-0 my-auto h-[3px] w-full rounded bg-arena-border/60" />
        <div
          className="absolute inset-y-0 my-auto h-[3px] rounded"
          style={{ left: 0, width: `${pct(row.accuracy)}%`, background: accent }}
        />
        {/* 95% CI whisker */}
        <div
          className="absolute inset-y-0 my-auto h-[11px] border-x-2 opacity-70"
          style={{
            left: `${pct(lo)}%`,
            width: `${Math.max(0.6, pct(hi) - pct(lo))}%`,
            borderColor: accent,
          }}
          title={`95% CI: ${lo.toFixed(1)}% – ${hi.toFixed(1)}%`}
        />
        <div
          className="absolute inset-y-0 my-auto h-[11px] w-[2px]"
          style={{ left: `${pct(row.accuracy)}%`, background: accent }}
        />
      </div>
      <span className="hidden w-[92px] shrink-0 font-[family-name:var(--font-mono-arena)] text-[10.5px] tabular-nums text-arena-faint md:block">
        [{lo.toFixed(1)}, {hi.toFixed(1)}]
      </span>
    </div>
  );
}

function CategoryBreakdown({ row, accent }: { row: LeaderboardRow; accent: string }) {
  if (!row.byCategory.length) {
    return <p className="text-[12px] text-arena-faint">No category breakdown in this run.</p>;
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {row.byCategory.map((c) => (
        <div key={c.category} className="rounded-lg border border-arena-border bg-arena-bg/50 p-3">
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <span className="text-[11px] font-medium capitalize text-arena-text">
              {c.category.replace("-", " ")}
            </span>
            <span className="font-[family-name:var(--font-mono-arena)] text-[11px] text-arena-faint">
              n={c.n}
            </span>
          </div>
          <div className="mb-1.5 h-1.5 w-full overflow-hidden rounded-full bg-arena-border/60">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.max(1, c.accuracy)}%`, background: accent }}
            />
          </div>
          <div className="flex justify-between font-[family-name:var(--font-mono-arena)] text-[11px] tabular-nums text-arena-dim">
            <span>{c.accuracy.toFixed(1)}%</span>
            <span>top-1 {c.top1Rate}%</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function LeaderboardClient({ boards }: { boards: LeaderboardView[] }) {
  const [boardIdx, setBoardIdx] = useState(0);
  const [sort, setSort] = useState<SortKey>("accuracy");
  const [expanded, setExpanded] = useState<string | null>(null);

  const board = boards[Math.min(boardIdx, boards.length - 1)];

  const rows = useMemo(() => {
    const col = COLUMNS.find((c) => c.key === sort);
    const asc = col?.asc ?? false;
    return [...board.rows].sort((a, b) => {
      const av = a[sort] as number;
      const bv = b[sort] as number;
      return asc ? av - bv : bv - av;
    });
  }, [board, sort]);

  // Where the top two intervals overlap, the lead is not established.
  const leadContested =
    rows.length > 1 &&
    sort === "accuracy" &&
    overlaps(rows[0].accuracyCI, rows[1].accuracyCI);

  return (
    <>
      {/* Condition tabs — scores from different conditions are different measurements */}
      {boards.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {boards.map((b, i) => (
            <button
              key={i}
              onClick={() => setBoardIdx(i)}
              className={`rounded-md border px-3 py-1.5 text-[12px] transition-colors ${
                i === boardIdx
                  ? "border-transparent bg-arena-text text-arena-bg"
                  : "border-arena-border text-arena-dim hover:text-arena-text"
              }`}
            >
              {b.condition.setId} · legal moves{" "}
              {b.condition.mode === "assisted" ? "shown" : "hidden"} ·{" "}
              {b.condition.promptVersion.replace("v1-", "")}
            </button>
          ))}
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 font-[family-name:var(--font-mono-arena)] text-[11px] text-arena-faint">
        <span>set {board.condition.setId}</span>
        <span className="text-arena-border">·</span>
        <span title="Position-set content hash">{board.condition.setHash}</span>
        <span className="text-arena-border">·</span>
        <span>{board.positions} positions</span>
        <span className="text-arena-border">·</span>
        <span>prompt {board.condition.promptVersion}</span>
        <span className="text-arena-border">·</span>
        <span>
          {board.gradingEngine} d{board.gradingDepth}
        </span>
      </div>

      {leadContested && (
        <p className="mb-3 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[12px] text-amber-300/90">
          The top two confidence intervals overlap — this sample does not
          establish a winner between them.
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-arena-border bg-arena-panel">
        <table className="w-full min-w-[820px] border-collapse text-left">
          <thead>
            <tr className="border-b border-arena-border text-[10px] uppercase tracking-[0.08em] text-arena-faint">
              <th className="w-10 px-3 py-2.5 font-medium">#</th>
              <th className="px-3 py-2.5 font-medium">Model</th>
              <th className="px-3 py-2.5 font-medium">
                <button
                  onClick={() => setSort("accuracy")}
                  className={`transition-colors hover:text-arena-text ${sort === "accuracy" ? "text-arena-text" : ""}`}
                  title="Lichess-scale accuracy, with a 95% bootstrap confidence interval"
                >
                  Accuracy {sort === "accuracy" ? "▾" : ""}
                </button>
              </th>
              {COLUMNS.map((c) => (
                <th key={c.key} className="px-3 py-2.5 text-right font-medium">
                  <button
                    onClick={() => setSort(c.key)}
                    title={c.help}
                    className={`transition-colors hover:text-arena-text ${sort === c.key ? "text-arena-text" : ""}`}
                  >
                    {c.label} {sort === c.key ? "▾" : ""}
                  </button>
                </th>
              ))}
              <th className="px-3 py-2.5 text-right font-medium">n</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const accent = getModel(row.modelId).accent;
              const open = expanded === row.modelId;
              return (
                <tr
                  key={row.modelId}
                  onClick={() => setExpanded(open ? null : row.modelId)}
                  className="cursor-pointer border-b border-arena-border/50 transition-colors last:border-0 hover:bg-white/[0.02]"
                >
                  <td className="px-3 py-3 font-[family-name:var(--font-mono-arena)] text-[13px] tabular-nums text-arena-faint">
                    {row.rank}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: accent }}
                      />
                      <span className="text-[13px] font-medium text-arena-text">{row.label}</span>
                      <span className="text-[10px] text-arena-faint">{open ? "▾" : "▸"}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <AccuracyBar row={row} accent={accent} />
                  </td>
                  {COLUMNS.map((c) => (
                    <td
                      key={c.key}
                      className="px-3 py-3 text-right font-[family-name:var(--font-mono-arena)] text-[12.5px] tabular-nums text-arena-dim"
                    >
                      {c.format(row)}
                    </td>
                  ))}
                  <td className="px-3 py-3 text-right font-[family-name:var(--font-mono-arena)] text-[12px] tabular-nums text-arena-faint">
                    {row.n}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {expanded && (
          <div className="border-t border-arena-border bg-arena-bg/40 p-4">
            {(() => {
              const row = rows.find((r) => r.modelId === expanded);
              if (!row) return null;
              const accent = getModel(row.modelId).accent;
              return (
                <>
                  <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-arena-dim">
                    <span className="font-medium text-arena-text">{row.label}</span>
                    <span>{row.modelId}</span>
                    <span>·</span>
                    <span title={`mean ${(row.avgLatencyMs / 1000).toFixed(1)}s — skewed by stalled requests`}>
                      {((row.medianLatencyMs || row.avgLatencyMs) / 1000).toFixed(1)}s / position (median)
                    </span>
                    <span>·</span>
                    <span>{row.totalTokens.toLocaleString()} tokens</span>
                    <span>·</span>
                    <span>eval supplied {row.evalCompliance}%</span>
                    <span>·</span>
                    <span>no answer {row.failureRate}%</span>
                    <span>·</span>
                    <span className="font-[family-name:var(--font-mono-arena)] text-arena-faint">
                      run {row.runIds.join(", ")}
                    </span>
                  </div>
                  <CategoryBreakdown row={row} accent={accent} />
                </>
              );
            })()}
          </div>
        )}
      </div>

      <p className="mt-2 text-[11px] text-arena-faint">
        Click a row for the per-category breakdown. Column headers sort.
      </p>
    </>
  );
}
