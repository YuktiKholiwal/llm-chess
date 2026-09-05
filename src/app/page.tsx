import { existsSync, readdirSync, readFileSync } from "node:fs";
import Link from "next/link";
import { LeaderboardClient } from "@/components/LeaderboardClient";
import { ArrowRightIcon } from "@/components/ui";
import {
  buildLeaderboards,
  overlaps,
  type LeaderboardView,
  type PublishedRun,
} from "@/bench/leaderboard";

export const metadata = {
  title: "LLM Chess Arena",
  description:
    "How well language models actually play chess. Every model answers the same positions and Stockfish grades every move — contamination-free, reproducible, with confidence intervals.",
};

const RESULTS_DIR = "bench/results";

/** Published runs are committed to the repo, so the board builds statically. */
function loadRuns(): PublishedRun[] {
  if (!existsSync(RESULTS_DIR)) return [];
  return readdirSync(RESULTS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(`${RESULTS_DIR}/${f}`, "utf8")) as PublishedRun)
    .sort((a, b) => a.publishedAt.localeCompare(b.publishedAt));
}

const NOTES = [
  {
    title: "Where the positions come from",
    body: "Engine self-play, not books or puzzle databases. Every position is novel by construction, so no model can have seen it in training — contamination is designed out rather than defended against. Sets are balanced on category and side to move.",
  },
  {
    title: "Why the error bars matter",
    body: "Each score carries a 95% confidence interval from a seeded bootstrap. Where two intervals overlap, the data does not separate those models, and the board says so rather than implying a ranking it cannot support.",
  },
  {
    title: "Reproducibility",
    body: "Every row is traceable to a position-set hash, a frozen prompt hash, and a pinned engine build and depth. Scores from different conditions are never mixed — they are shown as separate boards.",
  },
];

function Em({ children }: { children: React.ReactNode }) {
  return <strong className="font-medium text-arena-text">{children}</strong>;
}

/**
 * The sentence a visitor should leave with, written from the run on disk so it
 * can never drift out of step with the numbers underneath it.
 *
 * When the top two intervals overlap it says so here, in the headline, instead
 * of as a warning bolted onto the table: a board that cannot separate its
 * leaders should lead with that rather than bury it under a podium.
 */
function Finding({ board }: { board: LeaderboardView }) {
  const [first, second] = board.rows;
  if (!first) return null;

  const contested = !!second && overlaps(first.accuracyCI, second.accuracyCI);
  const blunders = board.rows.map((r) => r.blunderRate);
  const lo = Math.min(...blunders);
  const hi = Math.max(...blunders);

  return (
    <p
      className={`mb-8 max-w-[72ch] border-l-2 pl-4 text-[14.5px] leading-[1.75] text-arena-dim ${
        contested ? "border-arena-warn/45" : "border-arena-border"
      }`}
    >
      {!second ? (
        <>
          <Em>{first.label}</Em> is the only model measured on this set so far,
          at <Em>{first.accuracy.toFixed(1)}%</Em> over {first.n} positions. One
          model is not a comparison — it is a baseline waiting for company.
        </>
      ) : contested ? (
        <>
          <Em>{first.label}</Em> scores highest at{" "}
          <Em>{first.accuracy.toFixed(1)}%</Em>, but its confidence interval
          overlaps <Em>{second.label}</Em>&rsquo;s. At {board.positions}{" "}
          positions, this sample orders the two — it does not separate them.
          Read the gap between them as noise until the set grows.
        </>
      ) : (
        <>
          <Em>{first.label}</Em> leads at <Em>{first.accuracy.toFixed(1)}%</Em>,
          clear of <Em>{second.label}</Em> at {second.accuracy.toFixed(1)}%.
          Their intervals do not overlap, so {board.positions} positions are
          enough to separate them.
        </>
      )}{" "}
      {board.rows.length > 1 && (
        <>
          Across all {board.rows.length} models, the share of moves that throw
          away a winning or level position runs from <Em>{lo}%</Em> to{" "}
          <Em>{hi}%</Em>.
        </>
      )}
    </p>
  );
}

export default function Home() {
  const boards = buildLeaderboards(loadRuns());
  // The fullest board is the headline one; the rest are alternative conditions
  // the reader can switch to inside the table.
  const headline = boards[0];

  return (
    <main className="mx-auto min-h-screen max-w-[1120px] px-6 py-20 sm:py-24">
      <header className="max-w-[62ch]">
        <h1 className="text-[clamp(34px,4.8vw,50px)] font-semibold leading-[1.06] tracking-[-0.035em]">
          How well do language models actually play chess?
        </h1>
        <p className="mt-6 text-[16px] leading-[1.7] text-arena-dim">
          Every model answers the <Em>same positions</Em>, alone — there is no
          opponent whose choices could skew anyone&rsquo;s score. Stockfish
          grades each move against its own best, and what comes out is the board
          below.
        </p>
        <div className="mt-9 flex flex-wrap items-center gap-x-5 gap-y-3">
          <Link
            href="/arena"
            className="inline-flex h-10 items-center gap-2 rounded-md bg-arena-text px-5 text-[13.5px] font-medium text-arena-bg transition-colors hover:bg-white"
          >
            Watch a match play out
            <ArrowRightIcon />
          </Link>
          <span className="text-[12.5px] text-arena-faint">
            Two models, one game, graded as they go.
          </span>
        </div>
      </header>

      <section className="mt-20">
        <h2 className="mb-6 border-b border-arena-border pb-3 text-[10.5px] font-medium uppercase tracking-[0.09em] text-arena-faint">
          Evidence so far
        </h2>

        {!headline ? (
          <div className="rounded-xl border border-arena-border bg-arena-panel px-6 py-12 text-center">
            <p className="text-[14px] text-arena-dim">No published runs yet.</p>
            <pre className="mt-5 inline-block overflow-x-auto rounded-lg border border-arena-line bg-arena-bg px-4 py-3 text-left font-mono-arena text-[12px] leading-relaxed text-arena-text">
{`npm run bench -- --set bench/sets/core-v1.json \\
  --models anthropic/claude-haiku-4.5,google/gemini-3.7-flash \\
  --publish`}
            </pre>
          </div>
        ) : (
          <>
            <Finding board={headline} />
            <LeaderboardClient boards={boards} />
          </>
        )}
      </section>

      <section className="mt-20 grid gap-8 border-t border-arena-border pt-10 md:grid-cols-3">
        {NOTES.map((n) => (
          <div key={n.title}>
            <h2 className="mb-2 text-[13px] font-medium tracking-[-0.01em] text-arena-text">
              {n.title}
            </h2>
            <p className="text-[12.5px] leading-[1.65] text-arena-dim">{n.body}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
