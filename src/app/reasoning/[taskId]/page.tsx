import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { TraceView } from "@/components/reasoning/TraceView";
import { ArrowLeftIcon, ArrowRightIcon } from "@/components/ui";
import { loadTask, loadTraces } from "@/reasoning/data";

type Params = { params: Promise<{ taskId: string }> };

/** Every puzzle in the run is a static page; the data is a finished artifact. */
export function generateStaticParams() {
  return loadTraces().map(({ task }) => ({ taskId: task.id }));
}

export async function generateMetadata({ params }: Params) {
  const { taskId } = await params;
  const entry = loadTask(taskId);
  if (!entry) return { title: "Trace not found · Reasoning eval" };
  return {
    title: `Puzzle ${entry.task.id} · Reasoning eval`,
    description: `What ${entry.traces.length} models said about a ${entry.task.rating}-rated position, and which of it was true.`,
  };
}

export default async function TracePage({ params }: Params) {
  const { taskId } = await params;
  const entry = loadTask(taskId);
  if (!entry) notFound();

  // Neighbours in rating order, so paging through the set walks from easy to
  // hard rather than through an arbitrary file order.
  const all = loadTraces();
  const index = all.findIndex((t) => t.task.id === taskId);
  const previous = index > 0 ? all[index - 1].task.id : null;
  const next = index >= 0 && index < all.length - 1 ? all[index + 1].task.id : null;

  const falseClaims = entry.traces.reduce((a, t) => a + t.falseCount, 0);
  const solvers = entry.traces.filter((t) => t.solved).length;

  return (
    <PageShell wide>
      <nav className="mb-8 flex items-center gap-4 text-[12.5px]">
        <Link
          href="/reasoning/traces"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-arena-border px-2.5 text-arena-dim transition-colors hover:border-arena-edge hover:text-arena-text"
        >
          <ArrowLeftIcon />
          All traces
        </Link>
        <span className="text-arena-faint tabular-nums">
          {index + 1} of {all.length}, by rating
        </span>
        <span className="ml-auto flex items-center gap-2">
          {previous && (
            <Link
              href={`/reasoning/${previous}`}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-arena-border px-2.5 text-arena-dim transition-colors hover:border-arena-edge hover:text-arena-text"
            >
              <ArrowLeftIcon />
              Easier
            </Link>
          )}
          {next && (
            <Link
              href={`/reasoning/${next}`}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-arena-border px-2.5 text-arena-dim transition-colors hover:border-arena-edge hover:text-arena-text"
            >
              Harder
              <ArrowRightIcon />
            </Link>
          )}
        </span>
      </nav>

      <header className="mb-10 max-w-[70ch]">
        <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.09em] text-arena-faint">
          Reasoning eval · Puzzle{" "}
          <span className="font-mono-arena normal-case tracking-normal">
            {entry.task.id}
          </span>
        </p>
        <h1 className="text-[clamp(24px,3vw,32px)] font-semibold leading-[1.15] tracking-[-0.03em]">
          {solvers} of {entry.traces.length} models found the move
          {falseClaims > 0 && (
            <>
              , and said <span className="text-arena-bad">{falseClaims}</span> false things
              along the way
            </>
          )}
        </h1>
        <p className="mt-4 text-[13.5px] leading-[1.7] text-arena-dim">
          Green is the solution, red is what the model played when it differed. Each
          claim below was pulled out of the prose beside it and checked against this
          exact position.
        </p>
      </header>

      <TraceView task={entry.task} traces={entry.traces} />
    </PageShell>
  );
}
