import { existsSync, readdirSync, readFileSync } from "node:fs";
import Link from "next/link";
import { LeaderboardClient } from "@/components/LeaderboardClient";
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

export default function LeaderboardPage() {
  const boards = buildLeaderboards(loadRuns());

  return (
    <main className="mx-auto min-h-screen max-w-[1180px] px-5 py-8">
      <header className="mb-8">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-[26px] font-semibold tracking-tight">Leaderboard</h1>
          <Link
            href="/"
            className="rounded-md border border-arena-border px-3 py-1.5 text-[12px] text-arena-dim transition-colors hover:border-arena-dim hover:text-arena-text"
          >
            Watch a live match →
          </Link>
        </div>
        <p className="max-w-[70ch] text-[14px] leading-relaxed text-arena-dim">
          How well language models play chess, graded move by move by Stockfish.
          Every model answers the <strong className="text-arena-text">same positions</strong>,
          so the comparison is paired — there is no opponent whose choices could
          skew anyone&rsquo;s score.
        </p>
      </header>

      {boards.length === 0 ? (
        <div className="rounded-xl border border-arena-border bg-arena-panel p-8 text-center">
          <p className="text-[14px] text-arena-dim">No published runs yet.</p>
          <pre className="mt-4 inline-block rounded-md border border-arena-border bg-arena-bg px-4 py-3 text-left font-[family-name:var(--font-mono-arena)] text-[12px] text-arena-text">
{`npm run bench -- --set bench/sets/core-v1.json \\
  --models anthropic/claude-haiku-4.5,google/gemini-3.7-flash \\
  --publish`}
          </pre>
        </div>
      ) : (
        <LeaderboardClient boards={boards} />
      )}

      <section className="mt-12 grid gap-5 border-t border-arena-border pt-8 md:grid-cols-3">
        <div>
          <h2 className="mb-2 text-[13px] font-semibold">Where the positions come from</h2>
          <p className="text-[12.5px] leading-relaxed text-arena-dim">
            Engine self-play, not books or puzzle databases. Every position is
            novel by construction, so no model can have seen it in training —
            contamination is designed out rather than defended against. Sets are
            balanced on category and side to move.
          </p>
        </div>
        <div>
          <h2 className="mb-2 text-[13px] font-semibold">Why the error bars matter</h2>
          <p className="text-[12.5px] leading-relaxed text-arena-dim">
            Each score carries a 95% confidence interval from a seeded bootstrap.
            Where two intervals overlap, the data does not separate those models,
            and the board says so rather than implying a ranking it cannot support.
          </p>
        </div>
        <div>
          <h2 className="mb-2 text-[13px] font-semibold">Reproducibility</h2>
          <p className="text-[12.5px] leading-relaxed text-arena-dim">
            Every row is traceable to a position-set hash, a frozen prompt hash,
            and a pinned engine build and depth. Scores from different conditions
            are never mixed — they are shown as separate boards.
          </p>
        </div>
      </section>
    </main>
  );
}
