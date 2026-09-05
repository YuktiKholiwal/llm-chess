"use client";

import { useMemo, useState } from "react";
import { overlaps, type LeaderboardRow, type LeaderboardView } from "@/bench/leaderboard";
import { ChevronIcon, Label, Segmented, SortIcon } from "@/components/ui";

type SortKey =
  | "accuracy"
  | "acpl"
  | "top1Rate"
  | "blunderRate"
  | "evalErrorPawns"
  | "costPerPosition";

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

const clamp = (v: number) => Math.max(0, Math.min(100, v));

/**
 * Score, its interval and its bar as one cell. Splitting them — number here,
 * bar there, interval stranded at the far right — made the eye do three trips
 * for one fact.
 *
 * The ± is the interval's half-width, so a bootstrap CI that sits off-centre
 * reads as very slightly symmetric. The exact bounds stay in the tooltip and
 * are what the whisker actually draws.
 */
function ScoreCell({ row }: { row: LeaderboardRow }) {
  const [lo, hi] = row.accuracyCI;
  const half = (hi - lo) / 2;

  return (
    <div className="flex items-center gap-4">
      <span
        className="w-[128px] shrink-0 whitespace-nowrap font-mono-arena text-[13.5px] tabular-nums"
        title={`95% confidence interval: ${lo.toFixed(1)}% – ${hi.toFixed(1)}%`}
      >
        <span className="font-medium text-arena-text">{row.accuracy.toFixed(1)}%</span>
        <span className="text-arena-faint"> ± {half.toFixed(1)}%</span>
      </span>

      <div
        className="relative hidden h-1.5 min-w-[180px] flex-1 rounded-full bg-arena-panel-2 md:block"
        title={`95% confidence interval: ${lo.toFixed(1)}% – ${hi.toFixed(1)}%`}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-arena-text"
          style={{ width: `${clamp(row.accuracy)}%` }}
        />
        {/* 95% CI whisker, drawn over the fill so both stay readable */}
        <div
          className="absolute inset-y-0 my-auto h-px bg-arena-faint"
          style={{ left: `${clamp(lo)}%`, width: `${Math.max(0.5, clamp(hi) - clamp(lo))}%` }}
        />
        <div
          className="absolute inset-y-0 my-auto h-[7px] w-px bg-arena-faint"
          style={{ left: `${clamp(lo)}%` }}
        />
        <div
          className="absolute inset-y-0 my-auto h-[7px] w-px bg-arena-faint"
          style={{ left: `${clamp(hi)}%` }}
        />
      </div>
    </div>
  );
}

function CategoryBreakdown({ row }: { row: LeaderboardRow }) {
  if (!row.byCategory.length) {
    return <p className="text-[12.5px] text-arena-faint">No category breakdown in this run.</p>;
  }
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {row.byCategory.map((c) => (
        <div key={c.category} className="rounded-lg border border-arena-line bg-arena-panel p-3">
          <div className="mb-2.5 flex items-baseline justify-between gap-2">
            <span className="text-[12px] font-medium capitalize text-arena-text">
              {c.category.replace("-", " ")}
            </span>
            <span className="font-mono-arena text-[10.5px] tabular-nums text-arena-faint">
              n={c.n}
            </span>
          </div>
          <div className="mb-2 h-1 w-full overflow-hidden rounded-full bg-arena-panel-2">
            <div
              className="h-full rounded-full bg-arena-text"
              style={{ width: `${Math.max(1, clamp(c.accuracy))}%` }}
            />
          </div>
          <div className="flex justify-between font-mono-arena text-[10.5px] tabular-nums text-arena-dim">
            <span>{c.accuracy.toFixed(1)}%</span>
            <span className="text-arena-faint">top-1 {c.top1Rate}%</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function HeadCell({
  label,
  help,
  active,
  onSort,
  align = "right",
  grow,
}: {
  label: string;
  help?: string;
  active: boolean;
  onSort: () => void;
  align?: "left" | "right";
  /** Absorbs the table's leftover width — the score bar needs the room. */
  grow?: boolean;
}) {
  return (
    <th
      className={`px-4 py-3 ${align === "right" ? "text-right" : "text-left"} ${
        grow ? "w-full" : "whitespace-nowrap"
      }`}
    >
      <button
        type="button"
        onClick={onSort}
        title={help}
        className={`inline-flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.09em] transition-colors hover:text-arena-text ${
          active ? "text-arena-text" : "text-arena-faint"
        }`}
      >
        {label}
        <SortIcon active={active} />
      </button>
    </th>
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

  const colCount = COLUMNS.length + 3;

  return (
    <>
      {/* Run provenance, and the condition switcher when there is more than one
          board — scores from different conditions are different measurements. */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <dl className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {[
            { label: "Set", value: board.condition.setId },
            { label: "Hash", value: board.condition.setHash, title: "Position-set content hash" },
            { label: "Positions", value: String(board.positions) },
            { label: "Prompt", value: board.condition.promptVersion },
            { label: "Grader", value: `${board.gradingEngine} d${board.gradingDepth}` },
          ].map((it) => (
            <div key={it.label} className="flex items-baseline gap-1.5" title={it.title}>
              <dt className="text-[10.5px] font-medium uppercase tracking-[0.09em] text-arena-faint">
                {it.label}
              </dt>
              <dd className="font-mono-arena text-[12px] tabular-nums text-arena-dim">
                {it.value}
              </dd>
            </div>
          ))}
        </dl>

        {boards.length > 1 && (
          <div className="flex items-center gap-2.5">
            <Label>Condition</Label>
            <Segmented
              value={String(boardIdx)}
              onChange={(v) => {
                setBoardIdx(Number(v));
                setExpanded(null);
              }}
              options={boards.map((b, i) => ({
                value: String(i),
                label: `${b.condition.setId} · ${b.condition.mode === "assisted" ? "shown" : "hidden"}`,
                title: `Prompt ${b.condition.promptVersion} · legal moves ${
                  b.condition.mode === "assisted" ? "shown" : "hidden"
                }`,
              }))}
            />
          </div>
        )}
      </div>

      {leadContested && (
        <p className="mb-4 flex items-start gap-2.5 rounded-lg border border-arena-warn/25 bg-arena-warn/[0.06] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-arena-warn">
          <span aria-hidden className="mt-[6px] block h-1 w-1 shrink-0 rounded-full bg-arena-warn" />
          The top two confidence intervals overlap — this sample does not
          establish a winner between them.
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-arena-border">
        <table className="w-full min-w-[900px] border-collapse text-left">
          <thead>
            <tr className="border-b border-arena-border">
              <th className="whitespace-nowrap px-4 py-3 text-[10.5px] font-medium uppercase tracking-[0.09em] text-arena-faint">
                Model
              </th>
              <HeadCell
                label="Accuracy"
                help="Lichess-scale accuracy, with a 95% bootstrap confidence interval"
                active={sort === "accuracy"}
                onSort={() => setSort("accuracy")}
                align="left"
                grow
              />
              {COLUMNS.map((c) => (
                <HeadCell
                  key={c.key}
                  label={c.label}
                  help={c.help}
                  active={sort === c.key}
                  onSort={() => setSort(c.key)}
                />
              ))}
              <th className="whitespace-nowrap px-4 py-3 text-right text-[10.5px] font-medium uppercase tracking-[0.09em] text-arena-faint">
                n
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const open = expanded === row.modelId;
              return [
                <tr
                  key={row.modelId}
                  onClick={() => setExpanded(open ? null : row.modelId)}
                  className={`cursor-pointer border-b border-arena-line transition-colors last:border-0 hover:bg-white/[0.025] ${
                    open ? "bg-white/[0.025]" : ""
                  }`}
                >
                  <td className="whitespace-nowrap px-4 py-4">
                    <div className="flex items-center gap-2">
                      <span className="text-[13.5px] font-medium tracking-[-0.01em] text-arena-text">
                        {row.label}
                      </span>
                      <span className="text-arena-faint">
                        <ChevronIcon open={open} />
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <ScoreCell row={row} />
                  </td>
                  {COLUMNS.map((c) => (
                    <td
                      key={c.key}
                      className="whitespace-nowrap px-4 py-4 text-right font-mono-arena text-[13px] tabular-nums text-arena-dim"
                    >
                      {c.format(row)}
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-4 py-4 text-right font-mono-arena text-[12.5px] tabular-nums text-arena-faint">
                    {row.n}
                  </td>
                </tr>,

                /* Detail opens directly beneath its own row, so the numbers
                   stay next to the model they belong to. */
                open ? (
                  <tr
                    key={`${row.modelId}-detail`}
                    className="border-b border-arena-line last:border-0"
                  >
                    <td colSpan={colCount} className="bg-arena-bg px-4 pb-5 pt-1">
                      <div className="mb-3.5 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12px] text-arena-dim">
                        <span className="font-mono-arena text-arena-faint">{row.modelId}</span>
                        <span
                          title={`mean ${(row.avgLatencyMs / 1000).toFixed(1)}s — skewed by stalled requests`}
                        >
                          {((row.medianLatencyMs || row.avgLatencyMs) / 1000).toFixed(1)}s
                          <span className="text-arena-faint"> / position (median)</span>
                        </span>
                        <span>
                          {row.totalTokens.toLocaleString()}
                          <span className="text-arena-faint"> tokens</span>
                        </span>
                        <span>
                          {row.evalCompliance}%
                          <span className="text-arena-faint"> eval supplied</span>
                        </span>
                        <span>
                          {row.failureRate}%
                          <span className="text-arena-faint"> no answer</span>
                        </span>
                        <span className="font-mono-arena text-arena-faint">
                          run {row.runIds.join(", ")}
                        </span>
                      </div>
                      <CategoryBreakdown row={row} />
                    </td>
                  </tr>
                ) : null,
              ];
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[12px] text-arena-faint">
        Rows are ranked by the sorted column. Click one for its per-category
        breakdown.
      </p>
    </>
  );
}
