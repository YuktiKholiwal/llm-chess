import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { ArrowRightIcon } from "@/components/ui";
import { buildLeaderboards } from "@/bench/leaderboard";
import { loadPublishedRuns } from "@/bench/published";
import { loadResults, loadTraces } from "@/reasoning/data";

export const metadata = {
  title: "Chess evals",
  description:
    "Two evals for language models, played out over a chessboard. One grades the moves they make; the other checks whether what they say about the position is true.",
};

/* --------------------------------------------------------------- headline */

/**
 * Both cards quote a number off disk rather than a written-in one. If a run is
 * missing the card says so instead of showing a stale figure -- a homepage is
 * the last place a number should be allowed to drift from its source.
 */

function arenaHeadline() {
  const board = buildLeaderboards(loadPublishedRuns())[0];
  if (!board?.rows.length) return null;
  const top = board.rows[0];
  return {
    value: `${top.accuracy.toFixed(1)}%`,
    caption: `Best move accuracy, ${top.label}, over ${board.positions} frozen positions.`,
  };
}

function reasoningHeadline() {
  const rows = loadResults()?.overall ?? [];
  const scored = rows.filter((r) => r.claim_accuracy !== null);
  if (scored.length === 0) return null;
  const accuracies = scored.map((r) => (r.claim_accuracy as number) * 100);
  const lo = Math.min(...accuracies);
  const hi = Math.max(...accuracies);
  // Every model answers the same bank, so the puzzle count is the largest of
  // them rather than their sum -- which would report the trace count instead.
  const puzzles = Math.max(...scored.map((r) => r.tasks));
  return {
    value: `${lo.toFixed(0)}–${hi.toFixed(0)}%`,
    caption: `Share of what a model says about the board that is actually true, across ${scored.length} models and ${puzzles} puzzles.`,
  };
}

/* ------------------------------------------------------------------ cards */

type Door = {
  kicker: string;
  title: string;
  body: string;
  headline: { value: string; caption: string } | null;
  empty: string;
  primary: { href: string; label: string };
  secondary: { href: string; label: string };
};

function Door({ door }: { door: Door }) {
  return (
    <section className="flex flex-col rounded-xl border border-arena-border bg-arena-panel p-7">
      <p className="text-[10.5px] font-medium uppercase tracking-[0.09em] text-arena-faint">
        {door.kicker}
      </p>
      <h2 className="mt-3 text-[21px] font-semibold leading-[1.25] tracking-[-0.025em]">
        {door.title}
      </h2>
      <p className="mt-3 text-[13.5px] leading-[1.7] text-arena-dim">{door.body}</p>

      <div className="mt-7 border-t border-arena-line pt-6">
        {door.headline ? (
          <>
            <p className="font-mono-arena text-[34px] font-medium leading-none tracking-[-0.03em] text-arena-text tabular-nums">
              {door.headline.value}
            </p>
            <p className="mt-3 max-w-[40ch] text-[12px] leading-[1.6] text-arena-faint">
              {door.headline.caption}
            </p>
          </>
        ) : (
          <p className="text-[12.5px] leading-[1.6] text-arena-faint">{door.empty}</p>
        )}
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-3 pt-7">
        <Link
          href={door.primary.href}
          className="inline-flex h-10 items-center gap-2 rounded-md bg-arena-text px-5 text-[13.5px] font-medium text-arena-bg transition-colors hover:bg-white"
        >
          {door.primary.label}
          <ArrowRightIcon />
        </Link>
        <Link
          href={door.secondary.href}
          className="inline-flex h-10 items-center rounded-md border border-arena-border px-4 text-[13px] text-arena-dim transition-colors hover:border-arena-edge hover:text-arena-text"
        >
          {door.secondary.label}
        </Link>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------- page */

const DIFFERENCES = [
  {
    title: "One bit per game is not a measurement",
    body: "Who won tells you almost nothing — a single game is a coin flip. Both evals here refuse that trade: the arena grades all ~40 moves a model makes, and the reasoning eval pulls roughly six checkable claims out of every puzzle.",
  },
  {
    title: "The referee is stronger than the players",
    body: "Stockfish is far beyond any language model at chess, so its verdict is ground truth rather than another opinion. That is the property that makes a scoreboard possible at all, and it is the thing most model comparisons lack.",
  },
  {
    title: "Picking well and explaining well come apart",
    body: "A model can find the right move while describing a pin that is not on the board, or reason soundly and then play something else. Two evals, because those are two abilities and one number cannot hold both.",
  },
];

export default function Home() {
  const traces = loadTraces();
  const traceCount = traces.reduce((a, t) => a + t.traces.length, 0);

  const doors: Door[] = [
    {
      kicker: "Arena",
      title: "Two models play. Stockfish grades every move.",
      body: "Watch a full game unfold with both models' analysis streaming beside the board, an eval bar that moves as they blunder, and a scorecard that keeps count. Then read the frozen-position benchmark, where every model answers the same positions alone.",
      headline: arenaHeadline(),
      empty: "No published benchmark runs yet — the live match works regardless.",
      primary: { href: "/arena", label: "Watch a live match" },
      secondary: { href: "/arena/scorecard", label: "See the scorecard" },
    },
    {
      kicker: "Reasoning eval",
      title: "Models explain themselves. Every claim gets checked.",
      body: "Models solve Lichess puzzles and write out their reasoning. Each factual assertion in it is extracted and verified against python-chess and Stockfish, so a confident sentence about a defender that is not there is caught and counted.",
      headline: reasoningHeadline(),
      empty: "No scored run on disk yet. Run the pipeline to populate this.",
      primary: { href: "/reasoning", label: "See the results" },
      secondary: {
        href: "/reasoning/traces",
        label: traceCount > 0 ? `Browse ${traceCount} traces` : "Browse traces",
      },
    },
  ];

  return (
    <PageShell>
      <header className="max-w-[64ch]">
        <h1 className="text-[clamp(34px,4.8vw,50px)] font-semibold leading-[1.06] tracking-[-0.035em]">
          Two ways to measure a model over a chessboard
        </h1>
        <p className="mt-6 text-[16px] leading-[1.7] text-arena-dim">
          Most model comparisons are vibes. Chess has a referee that is stronger
          than every player in the room, which turns an opinion into a
          scoreboard — once for the moves a model chooses, and again for the
          things it claims are true about the position in front of it.
        </p>
      </header>

      <div className="mt-14 grid items-stretch gap-5 lg:grid-cols-2">
        {doors.map((door) => (
          <Door key={door.kicker} door={door} />
        ))}
      </div>

      <section className="mt-20 grid gap-8 border-t border-arena-border pt-10 md:grid-cols-3">
        {DIFFERENCES.map((d) => (
          <div key={d.title}>
            <h2 className="mb-2 text-[13px] font-medium tracking-[-0.01em] text-arena-text">
              {d.title}
            </h2>
            <p className="text-[12.5px] leading-[1.65] text-arena-dim">{d.body}</p>
          </div>
        ))}
      </section>
    </PageShell>
  );
}
