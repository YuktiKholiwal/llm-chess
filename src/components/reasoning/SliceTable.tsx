"use client";

import { useMemo, useState } from "react";
import type { ScoreRow } from "@/reasoning/types";
import { ModelDot, Pct, TableFrame, Td, Th } from "./bits";

/**
 * Slice rows pivoted so models are columns and the slice is the row.
 *
 * The scorer emits one row per (slice, model), which is the right shape for a
 * file and the wrong one for reading: sixty rows in scorer order asks a reader
 * to do the comparison in their head. Pivoted, a model that falls apart on one
 * motif is a column you can run your eye down.
 */

type Metric = { key: string; label: string; of: (r: ScoreRow) => number | null; n: (r: ScoreRow) => number };

const METRICS: Metric[] = [
  {
    key: "claim",
    label: "Claim accuracy",
    of: (r) => r.claim_accuracy,
    n: (r) => r.claims_true + r.claims_false,
  },
  {
    key: "solve",
    label: "Solve rate",
    of: (r) => r.solve_rate,
    n: (r) => r.tasks,
  },
  {
    key: "line",
    label: "Line claims",
    of: (r) => r.line_accuracy,
    n: (r) => r.line_claims,
  },
  {
    key: "state",
    label: "State claims",
    of: (r) => r.state_accuracy,
    n: (r) => r.state_claims,
  },
];

export function SliceTable({
  rows,
  accents,
  sliceLabel,
  /** Strips the `band:` / `theme:` prefix the scorer writes into `scope`. */
  stripPrefix,
}: {
  rows: ScoreRow[];
  accents: Record<string, string>;
  sliceLabel: string;
  stripPrefix: string;
}) {
  const [metricKey, setMetricKey] = useState(METRICS[0].key);
  const metric = METRICS.find((m) => m.key === metricKey) ?? METRICS[0];

  const { models, slices } = useMemo(() => {
    const models: { id: string; label: string }[] = [];
    for (const r of rows) {
      if (!models.some((m) => m.id === r.model)) models.push({ id: r.model, label: r.label });
    }
    models.sort((a, b) => a.label.localeCompare(b.label));

    const byScope = new Map<string, Map<string, ScoreRow>>();
    for (const r of rows) {
      const name = r.scope.startsWith(stripPrefix) ? r.scope.slice(stripPrefix.length) : r.scope;
      const cells = byScope.get(name) ?? new Map<string, ScoreRow>();
      cells.set(r.model, r);
      byScope.set(name, cells);
    }
    return { models, slices: [...byScope.entries()] };
  }, [rows, stripPrefix]);

  if (slices.length === 0) return null;

  return (
    <>
      <div
        role="group"
        aria-label="Metric"
        className="mb-4 inline-flex rounded-md border border-arena-border p-0.5"
      >
        {METRICS.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setMetricKey(m.key)}
            aria-pressed={m.key === metricKey}
            className={`rounded px-3 py-1.5 text-[12px] transition-colors ${
              m.key === metricKey
                ? "bg-arena-panel-2 font-medium text-arena-text"
                : "text-arena-faint hover:text-arena-dim"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <TableFrame>
        <thead>
          <tr>
            <Th align="left">{sliceLabel}</Th>
            {models.map((m) => (
              <Th key={m.id}>
                <span className="inline-flex items-center gap-1.5">
                  <ModelDot accent={accents[m.id] ?? "#7d7d7d"} />
                  {m.label}
                </span>
              </Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {slices.map(([name, cells]) => (
            <tr key={name} className="transition-colors hover:bg-arena-panel-2/60">
              <Td align="left">
                <span className="font-medium text-arena-text">{name}</span>
              </Td>
              {models.map((m) => {
                const row = cells.get(m.id);
                const value = row ? metric.of(row) : null;
                return (
                  <Td key={m.id}>
                    {row && value !== null ? (
                      <>
                        <span className="text-arena-text">
                          <Pct value={value} />
                        </span>
                        <span className="ml-1.5 font-mono-arena text-[10.5px] text-arena-faint tabular-nums">
                          n={metric.n(row)}
                        </span>
                      </>
                    ) : (
                      <span className="text-arena-faint">—</span>
                    )}
                  </Td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </TableFrame>
    </>
  );
}
