import { existsSync, readdirSync, readFileSync } from "node:fs";
import Link from "next/link";
import { LeaderboardClient } from "@/components/LeaderboardClient";
import { ArrowRightIcon } from "@/components/ui";
import { buildLeaderboards, type PublishedRun } from "@/bench/leaderboard";

export const metadata = {
  title: "Leaderboard · LLM Chess Arena",
  description:
    "How language models score on chess, graded move by move by Stockfish. Reproducible, contamination-free, with confidence intervals.",
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

export default function LeaderboardPage() {
  const boards = buildLeaderboards(loadRuns());

  return (
    <main className="mx-auto min-h-screen max-w-[1120px] px-6 py-16">
      <header className="mb-12">
        <h1 className="text-[clamp(36px,5vw,52px)] font-semibold leading-[1.05] tracking-[-0.035em]">
          LLM Chess Arena
        </h1>
        <p className="mt-4 max-w-[62ch] text-[16px] leading-[1.6] text-arena-dim">
          How well language models play chess, graded move by move by Stockfish.
          Every model answers the{" "}
          <strong className="font-medium text-arena-text">same positions</strong>, so the
          comparison is paired — there is no opponent whose choices could skew
          anyone&rsquo;s score.
        </p>
        <div className="mt-7">
          <Link
            href="/"
            className="inline-flex h-9 items-center gap-2 rounded-md bg-arena-text px-4 text-[13.5px] font-medium text-arena-bg transition-colors hover:bg-white"
          >
            Watch a live match
            <ArrowRightIcon />
          </Link>
        </div>
      </header>

      {boards.length === 0 ? (
        <div className="rounded-xl border border-arena-border bg-arena-panel px-6 py-12 text-center">
          <p className="text-[14px] text-arena-dim">No published runs yet.</p>
          <pre className="mt-5 inline-block overflow-x-auto rounded-lg border border-arena-line bg-arena-bg px-4 py-3 text-left font-mono-arena text-[12px] leading-relaxed text-arena-text">
{`npm run bench -- --set bench/sets/core-v1.json \\
  --models anthropic/claude-haiku-4.5,google/gemini-3.7-flash \\
  --publish`}
          </pre>
        </div>
      ) : (
        <LeaderboardClient boards={boards} />
      )}

      <section className="mt-16 grid gap-8 border-t border-arena-border pt-10 md:grid-cols-3">
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
