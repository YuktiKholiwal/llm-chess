import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { TraceBrowser } from "@/components/reasoning/TraceBrowser";
import { accentFor, loadTraceSummaries } from "@/reasoning/data";

export const metadata = {
  title: "Traces · Reasoning eval",
  description:
    "Every reasoning trace in the run, with each extracted claim marked true, false or unverifiable against the position it was made about.",
};

export default function Traces() {
  const summaries = loadTraceSummaries();
  const accents = Object.fromEntries(
    [...new Set(summaries.map((s) => s.model))].map((m) => [m, accentFor(m)]),
  );

  return (
    <PageShell wide>
      <header className="max-w-[68ch]">
        <p className="mb-4 text-[11px] font-medium uppercase tracking-[0.09em] text-arena-faint">
          Reasoning eval · Traces
        </p>
        <h1 className="text-[clamp(28px,3.6vw,38px)] font-semibold leading-[1.1] tracking-[-0.03em]">
          The evidence behind the numbers
        </h1>
        <p className="mt-5 text-[14.5px] leading-[1.7] text-arena-dim">
          One row per model per puzzle. Open any of them to see the position, what the
          model wrote about it, and the engine&rsquo;s verdict on every claim in that
          reasoning — the{" "}
          <Link
            href="/reasoning"
            className="text-arena-text underline underline-offset-2 hover:opacity-70"
          >
            headline rates
          </Link>{" "}
          are these, summed.
        </p>
      </header>

      <section className="mt-12">
        {summaries.length === 0 ? (
          <div className="rounded-xl border border-arena-border bg-arena-panel px-6 py-16 text-center">
            <p className="text-[13.5px] text-arena-dim">
              No traces on disk. The pipeline writes them to{" "}
              <code className="font-mono-arena text-[12.5px]">data/runs.jsonl</code>.
            </p>
          </div>
        ) : (
          <TraceBrowser summaries={summaries} accents={accents} />
        )}
      </section>
    </PageShell>
  );
}
