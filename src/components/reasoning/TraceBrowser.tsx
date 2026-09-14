"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { TraceSummary } from "@/reasoning/types";
import { ModelDot, Pct, TableFrame, Td, Th } from "./bits";

/**
 * The 600 traces, filterable.
 *
 * Filtering happens in the client over rows shipped with the page rather than
 * against a server route, because the whole corpus is a finished run on disk:
 * there is nothing to query that is not already known at build time, and a
 * round trip per keystroke would buy nothing.
 *
 * The one filter worth having is the last one -- solved the puzzle, and still
 * said something false about it. That combination is the eval's entire thesis,
 * and it is the view a reader should be able to reach in one click.
 */

const PAGE = 100;

type Outcome = "all" | "solved" | "missed" | "solved-but-wrong";

const OUTCOMES: { key: Outcome; label: string; hint: string }[] = [
  { key: "all", label: "All", hint: "Every trace" },
  { key: "solved", label: "Solved", hint: "Played the solution move" },
  { key: "missed", label: "Missed", hint: "Did not play the solution move" },
  {
    key: "solved-but-wrong",
    label: "Solved, but said something false",
    hint: "Right move, and at least one claim the engine contradicted",
  },
];

export function TraceBrowser({
  summaries,
  accents,
}: {
  summaries: TraceSummary[];
  accents: Record<string, string>;
}) {
  const [model, setModel] = useState("all");
  const [band, setBand] = useState("all");
  const [outcome, setOutcome] = useState<Outcome>("all");
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE);

  const models = useMemo(() => {
    const seen = new Map<string, string>();
    for (const s of summaries) seen.set(s.model, s.label);
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [summaries]);

  const bands = useMemo(
    () => [...new Set(summaries.map((s) => s.band))].sort((a, b) => a - b),
    [summaries],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return summaries.filter((s) => {
      if (model !== "all" && s.model !== model) return false;
      if (band !== "all" && String(s.band) !== band) return false;
      if (outcome === "solved" && !s.solved) return false;
      if (outcome === "missed" && s.solved) return false;
      if (outcome === "solved-but-wrong" && !(s.solved && s.falseCount > 0)) return false;
      if (q) {
        const haystack = `${s.taskId} ${s.themes.join(" ")} ${s.excerpt}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [summaries, model, band, outcome, query]);

  // Any change to the filters starts the list over; keeping a deep scroll
  // position across a new result set only ever looks like a bug.
  const reset = <T,>(set: (v: T) => void) => (value: T) => {
    set(value);
    setShown(PAGE);
  };

  const selectClass =
    "h-9 rounded-md border border-arena-border bg-arena-panel px-2.5 text-[12.5px] text-arena-dim transition-colors hover:border-arena-edge focus:text-arena-text";

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="trace-model">
          Model
        </label>
        <select
          id="trace-model"
          value={model}
          onChange={(e) => reset(setModel)(e.target.value)}
          className={selectClass}
        >
          <option value="all">All models</option>
          {models.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>

        <label className="sr-only" htmlFor="trace-band">
          Rating band
        </label>
        <select
          id="trace-band"
          value={band}
          onChange={(e) => reset(setBand)(e.target.value)}
          className={selectClass}
        >
          <option value="all">All ratings</option>
          {bands.map((b) => (
            <option key={b} value={String(b)}>
              {b} band
            </option>
          ))}
        </select>

        <label className="sr-only" htmlFor="trace-search">
          Search
        </label>
        <input
          id="trace-search"
          type="search"
          value={query}
          onChange={(e) => reset(setQuery)(e.target.value)}
          placeholder="Search motifs, puzzle id, reasoning…"
          className="h-9 min-w-[220px] flex-1 rounded-md border border-arena-border bg-arena-panel px-3 text-[12.5px] text-arena-text placeholder:text-arena-faint transition-colors hover:border-arena-edge"
        />
      </div>

      <div role="group" aria-label="Outcome" className="mb-5 flex flex-wrap gap-1.5">
        {OUTCOMES.map((o) => (
          <button
            key={o.key}
            type="button"
            title={o.hint}
            onClick={() => reset(setOutcome)(o.key)}
            aria-pressed={o.key === outcome}
            className={`rounded-md border px-3 py-1.5 text-[12px] transition-colors ${
              o.key === outcome
                ? "border-arena-edge bg-arena-panel-2 font-medium text-arena-text"
                : "border-arena-border text-arena-faint hover:border-arena-edge hover:text-arena-dim"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      <p className="mb-4 text-[12.5px] text-arena-faint">
        {filtered.length === summaries.length
          ? `${summaries.length} traces`
          : `${filtered.length} of ${summaries.length} traces`}
        {outcome === "solved-but-wrong" && filtered.length > 0 && (
          <> — the right move, reached through at least one false statement.</>
        )}
      </p>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-arena-border bg-arena-panel px-6 py-16 text-center text-[13px] text-arena-dim">
          Nothing matches those filters.
        </div>
      ) : (
        <TableFrame>
          <thead>
            <tr>
              <Th align="left">Puzzle</Th>
              <Th align="left">Model</Th>
              <Th>Rating</Th>
              <Th>Move</Th>
              <Th title="true / (true + false) over this trace's claims">Claims true</Th>
              <Th title="True · false · unverifiable">Breakdown</Th>
              <Th align="left">Opens with</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, shown).map((s) => (
              <tr
                key={`${s.taskId}-${s.model}`}
                className="group transition-colors hover:bg-arena-panel-2/60"
              >
                <Td align="left">
                  <Link
                    href={`/reasoning/${s.taskId}`}
                    className="font-mono-arena text-[12px] font-medium text-arena-text underline-offset-2 group-hover:underline"
                  >
                    {s.taskId}
                  </Link>
                </Td>
                <Td align="left">
                  <span className="inline-flex items-center gap-2 whitespace-nowrap">
                    <ModelDot accent={accents[s.model] ?? "#7d7d7d"} />
                    {s.label}
                  </span>
                </Td>
                <Td muted>{s.rating}</Td>
                <Td>
                  {s.solved ? (
                    <span className="text-arena-good">Solved</span>
                  ) : (
                    <span className="text-arena-faint">Missed</span>
                  )}
                </Td>
                <Td>
                  <span className="text-arena-text">
                    <Pct value={s.claimAccuracy} dp={0} />
                  </span>
                </Td>
                <Td>
                  <span className="whitespace-nowrap font-mono-arena text-[11.5px] tabular-nums">
                    <span className="text-arena-good">{s.trueCount}</span>
                    <span className="text-arena-faint"> · </span>
                    <span className="text-arena-bad">{s.falseCount}</span>
                    <span className="text-arena-faint"> · {s.unverifiableCount}</span>
                  </span>
                </Td>
                <Td align="left" muted>
                  <span className="line-clamp-2 max-w-[42ch] text-[12px] leading-[1.5]">
                    {s.excerpt}
                  </span>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableFrame>
      )}

      {shown < filtered.length && (
        <button
          type="button"
          onClick={() => setShown((n) => n + PAGE)}
          className="mt-5 h-10 w-full rounded-md border border-arena-border text-[13px] text-arena-dim transition-colors hover:border-arena-edge hover:text-arena-text"
        >
          Show {Math.min(PAGE, filtered.length - shown)} more
        </button>
      )}
    </>
  );
}
