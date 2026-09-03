/**
 * Runs a position set against one or more models and writes a signed run record.
 *
 * Every model sees the identical positions, so comparisons are paired: the
 * opponent-confound that makes head-to-head ACPL unreliable does not exist
 * here, because there is no opponent.
 *
 * Usage:
 *   npm run bench -- --set bench/sets/core-v1.json \
 *     --models anthropic/claude-haiku-4.5,google/gemini-3.7-flash \
 *     --limit 20 --max-cost 0.50
 */
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { loadEnv } from "./load-env";
import { NodeEngine } from "../src/bench/engine-node";
import { askModel } from "../src/bench/ask";
import { bootstrapCI, grade, summarise, type Grade } from "../src/bench/grade";
import { verifySet, type BenchPosition, type PositionSet } from "../src/bench/positions";
import { costOf, formatUsd, type Pricing } from "../src/lib/cost";
import { getModel } from "../src/lib/models";
import { promptHash, type PromptVersion } from "../src/lib/prompt";
import type { Mode, MoveRecord } from "../src/lib/types";

type Args = {
  set: string;
  models: string[];
  mode: Mode;
  promptVersion: PromptVersion;
  limit: number;
  depth: number;
  maxCost: number;
  outDir: string;
  dryRun: boolean;
};

function parseArgs(argv: string[]): Args {
  const get = (n: string, d: string) => {
    const i = argv.indexOf(`--${n}`);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
  };
  return {
    set: get("set", "bench/sets/core-v1.json"),
    models: get("models", "anthropic/claude-haiku-4.5").split(",").filter(Boolean),
    mode: get("mode", "assisted") as Mode,
    promptVersion: get("prompt", "v1-neutral") as PromptVersion,
    limit: Number(get("limit", "0")),
    depth: Number(get("depth", "16")),
    maxCost: Number(get("max-cost", "1.00")),
    outDir: get("out-dir", "runs"),
    dryRun: argv.includes("--dry-run"),
  };
}

async function fetchPricing(): Promise<Pricing> {
  try {
    const res = await fetch("https://ai-gateway.vercel.sh/v1/models");
    const json = (await res.json()) as {
      data?: { id: string; pricing?: { input?: string; output?: string } }[];
    };
    const out: Pricing = {};
    for (const m of json.data ?? []) {
      const i = Number(m.pricing?.input);
      const o = Number(m.pricing?.output);
      if (Number.isFinite(i) && Number.isFinite(o)) out[m.id] = { input: i, output: o };
    }
    return out;
  } catch {
    return {};
  }
}

async function main() {
  loadEnv();
  const args = parseArgs(process.argv.slice(2));

  const set = JSON.parse(readFileSync(args.set, "utf8")) as PositionSet;
  const check = verifySet(set);
  if (!check.ok) {
    console.error(
      `Position set hash mismatch.\n  recorded ${check.expected}\n  actual   ${check.actual}\n` +
        "The set has been modified since it was frozen; results would not be comparable.",
    );
    process.exit(1);
  }

  const positions = args.limit > 0 ? set.positions.slice(0, args.limit) : set.positions;
  const pricing = await fetchPricing();

  const engine = new NodeEngine();
  await engine.init();

  const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const dir = `${args.outDir}/${runId}`;
  mkdirSync(dir, { recursive: true });
  const resultsPath = `${dir}/results.jsonl`;

  // Everything needed to reproduce or audit this run.
  const manifest = {
    runId,
    startedAt: new Date().toISOString(),
    positionSet: { id: set.id, hash: set.hash, engine: set.engine, depth: set.depth },
    positionsRun: positions.length,
    models: args.models,
    mode: args.mode,
    prompt: { version: args.promptVersion, hash: promptHash(args.promptVersion) },
    gradingEngine: engine.version,
    gradingDepth: args.depth,
    maxCost: args.maxCost,
  };
  writeFileSync(`${dir}/manifest.json`, JSON.stringify(manifest, null, 2) + "\n");

  console.log(`run        ${runId}`);
  console.log(`set        ${set.id} (${set.hash})  ${positions.length} positions`);
  console.log(`prompt     ${args.promptVersion} (${manifest.prompt.hash})   mode: ${args.mode}`);
  console.log(`grading    ${engine.version} depth ${args.depth}`);
  console.log(`models     ${args.models.join(", ")}`);
  console.log(`cost cap   ${formatUsd(args.maxCost)}\n`);

  if (args.dryRun) {
    console.log("--dry-run: nothing was sent to any model.");
    engine.quit();
    return;
  }

  // Engine evaluations are cached by FEN across models: the position after a
  // given move is the same no matter who proposed it.
  const evalCache = new Map<string, number>();
  const evalAfter = async (fen: string): Promise<number> => {
    const hit = evalCache.get(fen);
    if (hit !== undefined) return hit;
    const a = await engine.analyze(fen, { depth: args.depth, multipv: 1 });
    const cp = a.lines[0]?.cp ?? 0;
    evalCache.set(fen, cp);
    return cp;
  };

  const perModel = new Map<string, { grades: Grade[]; records: MoveRecord[] }>();
  let spend = 0;
  let stoppedEarly = false;
  let consecutiveErrors = 0;
  const MAX_CONSECUTIVE_ERRORS = 3;

  outer: for (const modelId of args.models) {
    const spec = getModel(modelId);
    perModel.set(modelId, { grades: [], records: [] });
    console.log(`\n${spec.label}`);

    for (let i = 0; i < positions.length; i++) {
      if (spend >= args.maxCost) {
        console.log(`\n  cost cap ${formatUsd(args.maxCost)} reached — stopping.`);
        stoppedEarly = true;
        break outer;
      }

      const p: BenchPosition = positions[i];
      const res = await askModel(modelId, p.fen, {
        mode: args.mode,
        promptVersion: args.promptVersion,
      });

      let cpAfter: number | null = null;
      if (res.legal && res.san) {
        const { Chess } = await import("chess.js");
        const c = new Chess(p.fen);
        c.move(res.san);
        cpAfter = await evalAfter(c.fen());
      }

      // Distinguish "the model got it wrong" from "we could not ask it".
      if (res.error) {
        consecutiveErrors++;
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          console.error(
            `\n\n${MAX_CONSECUTIVE_ERRORS} consecutive request failures — aborting.\n` +
              `Last error: ${res.error}\n\n` +
              "Scoring these as model failures would be wrong, so nothing is reported.",
          );
          engine.quit();
          process.exit(1);
        }
        continue;
      }
      consecutiveErrors = 0;

      const g = grade(p, res, cpAfter);
      const bucket = perModel.get(modelId)!;
      bucket.grades.push(g);

      // Reuse the arena's record shape so cost accounting is shared.
      const record = {
        ply: 0,
        moveNumber: 0,
        color: (p.fen.split(" ")[1] === "b" ? "b" : "w") as "w" | "b",
        san: res.san ?? "",
        modelId,
        fenBefore: p.fen,
        fenAfter: "",
        analysis: res.analysis,
        reasoning: "",
        illegalAttempts: res.rejected,
        retries: res.rejected.length,
        forced: false,
        thinkMs: res.elapsedMs,
        usage: res.usage,
      } as MoveRecord;
      bucket.records.push(record);
      spend = [...perModel.values()].reduce((a, b) => a + costOf(b.records, pricing), 0);

      appendFileSync(
        resultsPath,
        JSON.stringify({
          modelId,
          positionId: p.id,
          fen: p.fen,
          category: p.category,
          expectedBest: p.best,
          cpBefore: p.cp,
          cpAfter,
          answer: res.san,
          legal: res.legal,
          rejected: res.rejected,
          evalClaim: res.evalClaim,
          usage: res.usage,
          elapsedMs: res.elapsedMs,
          error: res.error,
          grade: g,
        }) + "\n",
      );

      const mark = !g.answered ? "✗" : g.top1 ? "★" : g.quality === "blunder" ? "!" : "·";
      process.stdout.write(
        `\r  ${i + 1}/${positions.length} ${mark}  spend ${formatUsd(spend)}   `,
      );
    }
  }

  engine.quit();
  console.log("\n");

  // Report
  const CATEGORIES = ["tactical", "positional", "blunder-avoidance", "endgame"];
  for (const [modelId, { grades }] of perModel) {
    if (!grades.length) continue;
    const spec = getModel(modelId);
    const overall = summarise(grades);
    const accCI = bootstrapCI(
      grades.filter((g) => g.answered).map((g) => g.accuracy ?? 0),
    );

    console.log(`${spec.label}`);
    console.log(
      `  accuracy    ${overall.accuracy.toFixed(1)}%  [${accCI.lo.toFixed(1)}, ${accCI.hi.toFixed(1)}]  (95% CI)`,
    );
    console.log(`  acpl        ${overall.acpl}`);
    console.log(`  top-1       ${overall.top1Rate}%      top-k ${overall.topKRate}%`);
    console.log(`  blunders    ${overall.blunderRate}%`);
    console.log(`  no answer   ${overall.failureRate}%   illegal/pos ${overall.illegalPerPosition}`);
    console.log(
      `  eval error  ${overall.evalErrorPawns} pawns  (supplied ${overall.evalCompliance}%)`,
    );

    for (const c of CATEGORIES) {
      const idx = positions
        .map((p, i) => (p.category === c ? i : -1))
        .filter((i) => i >= 0 && i < grades.length);
      if (!idx.length) continue;
      const s = summarise(idx.map((i) => grades[i]), c);
      console.log(`    ${c.padEnd(18)} n=${String(s.n).padStart(3)}  acc ${s.accuracy.toFixed(1)}%  top1 ${s.top1Rate}%`);
    }
    console.log("");
  }

  writeFileSync(
    `${dir}/manifest.json`,
    JSON.stringify(
      {
        ...manifest,
        finishedAt: new Date().toISOString(),
        stoppedEarly,
        totalCost: Number(spend.toFixed(6)),
        summary: Object.fromEntries(
          [...perModel].map(([m, { grades }]) => [m, summarise(grades)]),
        ),
      },
      null,
      2,
    ) + "\n",
  );

  console.log(`total ${formatUsd(spend)}   results → ${dir}/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
