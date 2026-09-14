import Link from "next/link";
import { NextStep, PageShell } from "@/components/PageShell";
import {
  CI,
  Gap,
  ModelDot,
  Pct,
  SectionHeading,
  Stat,
  TableFrame,
  Td,
  Th,
} from "@/components/reasoning/bits";
import { SliceTable } from "@/components/reasoning/SliceTable";
import { accentFor, loadResults, loadTraces } from "@/reasoning/data";
import {
  KILL_CHECK_POINTS,
  METRICS,
  separationOf,
  type Separation,
} from "@/reasoning/separation";

export const metadata = {
  title: "Reasoning eval · Chess evals",
  description:
    "Models solve chess puzzles and write out their reasoning. Every factual claim in it is extracted and checked against python-chess and Stockfish.",
};

function Em({ children }: { children: React.ReactNode }) {
  return <strong className="font-medium text-arena-text">{children}</strong>;
}

/**
 * The verdict on one metric, written from the numbers rather than alongside
 * them. A metric that fails the kill check says so in the same sentence that
 * reports its spread -- which is the only arrangement a reader cannot skim
 * past on the way to the ranking.
 */
function Verdict({ name, sep }: { name: string; sep: Separation }) {
  if (!sep.high || !sep.low) return null;

  return (
    <li className="border-l-2 border-arena-border pl-4">
      <p className="text-[13px] leading-[1.65] text-arena-dim">
        <Em>{name}</Em> spans <Em>{sep.spread.toFixed(1)} points</Em>, from{" "}
        {sep.low.value.toFixed(1)}% ({sep.low.label}) to {sep.high.value.toFixed(1)}% (
        {sep.high.label}).{" "}
        {sep.separates ? (
          <span className="text-arena-good">
            It separates the models — the spread clears {KILL_CHECK_POINTS} points and no
            intervals overlap.
          </span>
        ) : sep.spread < KILL_CHECK_POINTS ? (
          <span className="text-arena-faint">
            Too narrow to report as a result: under {KILL_CHECK_POINTS} points is inside
            the noise this eval can resolve.
          </span>
        ) : (
          <span className="text-arena-warn">
            It does not separate them — intervals still overlap for{" "}
            {sep.overlappingPairs.map((p) => p.join(" / ")).join(", ")}. The point
            estimates order these models; the data does not.
          </span>
        )}
      </p>
    </li>
  );
}

function Empty() {
  return (
    <PageShell>
      <header className="max-w-[62ch]">
        <h1 className="text-[clamp(32px,4.4vw,46px)] font-semibold leading-[1.06] tracking-[-0.035em]">
          No scored run on disk
        </h1>
        <p className="mt-6 text-[15px] leading-[1.7] text-arena-dim">
          The pipeline writes <code className="font-mono-arena text-[13px]">data/results.json</code>{" "}
          at its last stage. Run it to fill this page:
        </p>
        <pre className="mt-6 overflow-x-auto rounded-lg border border-arena-line bg-arena-panel px-4 py-3 font-mono-arena text-[12px] leading-relaxed text-arena-text">
{`uv run python -m eval tasks
uv run python -m eval run
uv run python -m eval extract
uv run python -m eval verify
uv run python -m eval score`}
        </pre>
      </header>
    </PageShell>
  );
}

export default function ReasoningResults() {
  const results = loadResults();
  if (!results || results.overall.length === 0) return <Empty />;

  const rows = [...results.overall].sort(
    (a, b) => (b.claim_accuracy ?? 0) - (a.claim_accuracy ?? 0),
  );
  const accents = Object.fromEntries(rows.map((r) => [r.model, accentFor(r.model)]));
  const traceCount = loadTraces().reduce((a, t) => a + t.traces.length, 0);

  const totalSpend = rows.reduce((a, r) => a + r.total_cost_usd, 0);
  const tasks = Math.max(...rows.map((r) => r.tasks));
  const partial = rows.filter((r) => r.verified_tasks < r.tasks);

  const overallSep = separationOf(rows, METRICS.claimAccuracy);
  const stateSep = separationOf(rows, METRICS.stateAccuracy);
  const lineSep = separationOf(rows, METRICS.lineAccuracy);

  return (
    <PageShell>
      <header className="max-w-[64ch]">
        <p className="mb-4 text-[11px] font-medium uppercase tracking-[0.09em] text-arena-faint">
          Reasoning eval
        </p>
        <h1 className="text-[clamp(32px,4.4vw,46px)] font-semibold leading-[1.06] tracking-[-0.035em]">
          Is what the model says about the board actually true?
        </h1>
        <p className="mt-6 text-[16px] leading-[1.7] text-arena-dim">
          Models solve Lichess puzzles and write out their reasoning. Every factual
          claim in that reasoning is extracted and checked against python-chess and
          Stockfish. The number this eval exists to produce is the{" "}
          <Em>gap</Em> between how often a model picks the right move and how often
          the things it says about the position hold up.
        </p>
        <p className="mt-4 text-[14px] leading-[1.7] text-arena-dim">
          A model can solve a puzzle while describing a pin that does not exist.
          Solve rate cannot see that — it reports one bit per puzzle. Checking the
          reasoning turns a single puzzle into a dozen verifiable assertions.
        </p>
      </header>

      <dl className="mt-12 grid grid-cols-2 gap-x-8 gap-y-8 border-y border-arena-border py-8 sm:grid-cols-4">
        <Stat label="Puzzles" value={tasks} hint={`${rows.length} models, ${traceCount} traces`} />
        <Stat
          label="Engine"
          value={`d${results.engine_depth}`}
          hint="Stockfish, one line per position"
        />
        <Stat
          label="Spend"
          value={`$${totalSpend.toFixed(2)}`}
          hint={`Extractor: ${results.extractor.split("/").pop()}`}
        />
        <Stat
          label="Run"
          value={results.generated_at.slice(0, 10)}
          hint={`commit ${results.commit}`}
        />
      </dl>

      {/* ------------------------------------------------------- headline */}

      <section className="mt-16">
        <SectionHeading note="Gap = solve rate − claim accuracy, in points">
          Headline
        </SectionHeading>

        <TableFrame>
          <thead>
            <tr>
              <Th align="left">Model</Th>
              <Th title="Share of puzzles where the model played the solution move">
                Solve rate
              </Th>
              <Th title="true / (true + false) over extracted claims">Claim accuracy</Th>
              <Th>Gap</Th>
              <Th title="Claims that could not be checked either way">Unverifiable</Th>
              <Th>Claims/task</Th>
              <Th>$/task</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.model} className="transition-colors hover:bg-arena-panel-2/60">
                <Td align="left">
                  <span className="inline-flex items-center gap-2 font-medium text-arena-text">
                    <ModelDot accent={accents[r.model]} />
                    {r.label}
                  </span>
                  {r.verified_tasks < r.tasks && (
                    <span
                      title={`The verifier reached ${r.verified_tasks} of ${r.tasks} runs for this model`}
                      className="ml-2 whitespace-nowrap rounded border border-arena-warn/35 bg-arena-warn/10 px-1.5 py-0.5 text-[10px] font-medium text-arena-warn"
                    >
                      {r.verified_tasks}/{r.tasks}
                    </span>
                  )}
                </Td>
                <Td>
                  <span className="text-arena-text">
                    <Pct value={r.solve_rate} />
                  </span>
                  <CI ci={r.solve_rate_ci} />
                </Td>
                <Td>
                  <span className="text-arena-text">
                    <Pct value={r.claim_accuracy} />
                  </span>
                  <CI ci={r.claim_accuracy_ci} />
                </Td>
                <Td>
                  <Gap value={r.reasoning_outcome_gap} />
                </Td>
                <Td>
                  <Pct value={r.unverifiable_rate} />
                </Td>
                <Td>{r.claims_per_task.toFixed(1)}</Td>
                <Td muted>${r.cost_per_task.toFixed(4)}</Td>
              </tr>
            ))}
          </tbody>
        </TableFrame>

        <p className="mt-4 max-w-[76ch] text-[12.5px] leading-[1.7] text-arena-faint">
          Claim accuracy is true / (true + false); unverifiable claims are excluded from
          it and reported separately. Read it carefully — the metric rewards vagueness,
          because a model that hedges everything into unverifiable prose scores well on a
          very small denominator. Read it alongside claims-per-task and the unverifiable
          rate, never alone.
          {partial.length > 0 && (
            <>
              {" "}
              A badge marks a model the verifier did not finish; its rates rest on the
              smaller denominator shown rather than on the full run.
            </>
          )}
        </p>
      </section>

      {/* ---------------------------------------------------- kill check */}

      <section className="mt-16">
        <SectionHeading note={`Threshold: ${KILL_CHECK_POINTS} points and no overlap`}>
          What actually separates the models
        </SectionHeading>
        <ul className="grid gap-5">
          <Verdict name="Claim accuracy" sep={overallSep} />
          <Verdict name="State-claim accuracy" sep={stateSep} />
          <Verdict name="Line-claim accuracy" sep={lineSep} />
        </ul>
        <p className="mt-6 max-w-[76ch] text-[12.5px] leading-[1.7] text-arena-faint">
          A <Em>state claim</Em> is a fact about the position as it stands — &ldquo;the
          knight on f6 is pinned.&rdquo; A <Em>line claim</Em> is a calculated variation
          — &ldquo;if Qxc4, Nxc4 wins the queen for a rook.&rdquo; They are different
          abilities, and a single accuracy figure hides which one a model has. Intervals
          are 95% percentile bootstraps over 2000 resamples of whole tasks, not
          individual claims: claims from one trace are correlated, and resampling them
          independently would report an interval far narrower than the evidence supports.
        </p>
      </section>

      {/* ------------------------------------------------------- evidence */}

      <section className="mt-16">
        <SectionHeading>How much evidence is behind each number</SectionHeading>
        <TableFrame>
          <thead>
            <tr>
              <Th align="left">Model</Th>
              <Th>True</Th>
              <Th>False</Th>
              <Th>Unverifiable</Th>
              <Th>State claims</Th>
              <Th>Line claims</Th>
              <Th title="Share of plans that named their own move rather than needing a resolver">
                Plans naming a move
              </Th>
              <Th title="Share of resolved plans losing under 100cp against the engine's best">
                Sound plans
              </Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.model} className="transition-colors hover:bg-arena-panel-2/60">
                <Td align="left">
                  <span className="inline-flex items-center gap-2 font-medium text-arena-text">
                    <ModelDot accent={accents[r.model]} />
                    {r.label}
                  </span>
                </Td>
                <Td>
                  <span className="text-arena-good tabular-nums">{r.claims_true}</span>
                </Td>
                <Td>
                  <span className="text-arena-bad tabular-nums">{r.claims_false}</span>
                </Td>
                <Td muted>{r.claims_unverifiable}</Td>
                <Td>
                  <Pct value={r.state_accuracy} />
                  <span className="ml-1.5 font-mono-arena text-[10.5px] text-arena-faint tabular-nums">
                    n={r.state_claims}
                  </span>
                </Td>
                <Td>
                  <Pct value={r.line_accuracy} />
                  <span className="ml-1.5 font-mono-arena text-[10.5px] text-arena-faint tabular-nums">
                    n={r.line_claims}
                  </span>
                </Td>
                <Td>
                  <Pct value={r.plan_named_rate} dp={0} />
                </Td>
                <Td>
                  <Pct value={r.plan_sound_rate} dp={0} />
                </Td>
              </tr>
            ))}
          </tbody>
        </TableFrame>
        <p className="mt-4 max-w-[76ch] text-[12.5px] leading-[1.7] text-arena-faint">
          Read the last two columns together. Where a plan does not name its move, a
          model call has to infer one, and the resolver&rsquo;s mistakes then read as the
          model contradicting itself — so a model at 14% is having most of its plans
          guessed at, and its figures are not comparable with one at 81%.
        </p>
      </section>

      {/* --------------------------------------------------------- slices */}

      <section className="mt-16">
        <SectionHeading note="Cut from cached data — no model calls, no engine runs">
          By rating band
        </SectionHeading>
        <SliceTable
          rows={results.by_band}
          accents={accents}
          sliceLabel="Band"
          stripPrefix="band:"
        />
      </section>

      <section className="mt-16">
        <SectionHeading note="Motifs appearing in at least 10 tasks">By motif</SectionHeading>
        <SliceTable
          rows={results.by_theme}
          accents={accents}
          sliceLabel="Motif"
          stripPrefix="theme:"
        />
      </section>

      {/* ---------------------------------------------------- limitations */}

      <section className="mt-16">
        <SectionHeading>What this does not measure</SectionHeading>
        <div className="grid gap-8 md:grid-cols-3">
          <div>
            <h3 className="mb-2 text-[13px] font-medium text-arena-text">
              Contamination is not controlled
            </h3>
            <p className="text-[12.5px] leading-[1.65] text-arena-dim">
              The Lichess export carries no puzzle creation date — its only date column
              marks the day a puzzle was featured, and is absent for almost all of them.
              These puzzles may well appear in training data. Nothing here separates
              recall from reasoning.
            </p>
          </div>
          <div>
            <h3 className="mb-2 text-[13px] font-medium text-arena-text">
              The extractor is a model, not an oracle
            </h3>
            <p className="text-[12.5px] leading-[1.65] text-arena-dim">
              Claims are extracted by {results.extractor.split("/").pop()}, and a claim it
              fails to extract is one the model is never held to. Its own error rate is
              unmeasured and is included in none of the intervals above.
            </p>
          </div>
          <div>
            <h3 className="mb-2 text-[13px] font-medium text-arena-text">
              Plan scoring depends on resolving a sentence to a move
            </h3>
            <p className="text-[12.5px] leading-[1.65] text-arena-dim">
              Where a plan names its move, that move is read from the text. Where it does
              not, a model call resolves it, and plans that resolve to nothing are
              excluded rather than assumed.
            </p>
          </div>
        </div>
      </section>

      <NextStep
        href="/reasoning/traces"
        kicker="See it happen"
        title={`Read the ${traceCount} traces these numbers came from`}
        body="Every puzzle, every model's reasoning, and each claim marked true, false or unverifiable against the board it was made about. The table above is the summary; this is the evidence."
      />

      <p className="mt-10 text-[12px] text-arena-faint">
        The other eval grades the moves rather than the words —{" "}
        <Link href="/arena/scorecard" className="text-arena-dim underline underline-offset-2 hover:text-arena-text">
          see the arena scorecard
        </Link>
        .
      </p>
    </PageShell>
  );
}
