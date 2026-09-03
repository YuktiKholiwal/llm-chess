/**
 * Generates a frozen position set from engine self-play.
 *
 * Positions are produced rather than curated for two reasons. They are novel
 * by construction -- no position here has appeared in a book, a puzzle
 * database, or anyone's training data -- which removes contamination as a
 * concern rather than trying to defend against it. And they avoid curator
 * bias: nobody chose what to test, so the set cannot quietly favour a
 * particular style of play.
 *
 * Usage:
 *   npm run bench:gen -- --games 40 --out bench/sets/core-v1.json
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { loadEnv } from "./load-env";
import { dirname } from "node:path";
import { Chess } from "chess.js";
import { NodeEngine } from "../src/bench/engine-node";
import {
  classifyPosition,
  makeSet,
  positionId,
  uciToSan,
  type BenchPosition,
} from "../src/bench/positions";

type Args = {
  games: number;
  out: string;
  id: string;
  depth: number;
  multipv: number;
  playDepth: number;
  sampleEvery: number;
  minPly: number;
  maxPlies: number;
  perCategory: number;
  seed: number;
};

function parseArgs(argv: string[]): Args {
  const get = (name: string, fallback: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
  };
  return {
    games: Number(get("games", "30")),
    out: get("out", "bench/sets/core-v1.json"),
    id: get("id", "core-v1"),
    depth: Number(get("depth", "16")),
    multipv: Number(get("multipv", "8")),
    playDepth: Number(get("play-depth", "6")),
    sampleEvery: Number(get("sample-every", "5")),
    minPly: Number(get("min-ply", "8")),
    maxPlies: Number(get("max-plies", "140")),
    perCategory: Number(get("per-category", "40")),
    seed: Number(get("seed", "20260902")),
  };
}

/** Deterministic PRNG so a set can be regenerated exactly. */
function makeRng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/**
 * Plays a game with a weak engine that occasionally moves at random. The
 * randomness is the point: perfect play converges on the same handful of
 * drawn positions, whereas imperfect play produces the messy, unbalanced
 * middlegames where models actually differ.
 */
async function selfPlay(
  engine: NodeEngine,
  rng: () => number,
  opts: { playDepth: number; maxPlies: number },
): Promise<string[]> {
  const chess = new Chess();
  const fens: string[] = [];

  while (!chess.isGameOver() && chess.history().length < opts.maxPlies) {
    const legal = chess.moves();
    let san: string;
    // A quarter of moves are random, and the first four always are, so games
    // diverge immediately instead of replaying book lines.
    if (chess.history().length < 4 || rng() < 0.25) {
      san = legal[Math.floor(rng() * legal.length)];
    } else {
      const a = await engine.analyze(chess.fen(), { depth: opts.playDepth, multipv: 1 });
      san = uciToSan(chess.fen(), a.lines[0]?.move ?? "") ?? legal[0];
    }
    chess.move(san);
    fens.push(chess.fen());
  }
  return fens;
}

async function main() {
  loadEnv();
  const args = parseArgs(process.argv.slice(2));
  const rng = makeRng(args.seed);
  const engine = new NodeEngine();
  await engine.init();

  console.log(`engine: ${engine.version}`);
  console.log(
    `generating from ${args.games} self-play games, labelling at depth ${args.depth} multipv ${args.multipv}\n`,
  );

  // 1. Collect candidate positions from self-play.
  const candidates = new Map<string, { fen: string; ply: number }>();
  for (let g = 0; g < args.games; g++) {
    const fens = await selfPlay(engine, rng, { playDepth: args.playDepth, maxPlies: args.maxPlies });
    // Offset the sampling phase per game. Sampling at a fixed stride locks the
    // parity of `ply`, which locks the side to move -- a set generated that way
    // only ever tests one colour.
    const offset = g % args.sampleEvery;
    fens.forEach((fen, i) => {
      const ply = i + 1;
      if (ply < args.minPly) return;
      if ((ply + offset) % args.sampleEvery !== 0) return;
      const c = new Chess(fen);
      if (c.isGameOver()) return;
      if (c.moves().length < 2) return; // nothing to choose between
      candidates.set(positionId(fen), { fen, ply });
    });
    process.stdout.write(`\r  games ${g + 1}/${args.games}  candidates ${candidates.size}`);
  }
  console.log("\n");

  // 2. Label each candidate with a deeper multi-line search.
  const positions: BenchPosition[] = [];
  const all = [...candidates.values()];
  let skippedDecided = 0;

  for (let i = 0; i < all.length; i++) {
    const { fen, ply } = all[i];
    const a = await engine.analyze(fen, { depth: args.depth, multipv: args.multipv });
    if (a.lines.length < 2) continue;

    const chess = new Chess(fen);
    const sign = chess.turn() === "w" ? 1 : -1;

    // Already-decided positions measure nothing: any sane move keeps the win.
    if (Math.abs(a.lines[0].cp) > 800) {
      skippedDecided++;
      continue;
    }

    const best = a.lines
      .map((l) => uciToSan(fen, l.move))
      .filter((s): s is string => s !== null);
    if (best.length < 2) continue;

    positions.push({
      id: positionId(fen),
      fen,
      category: classifyPosition(fen, a.lines),
      best,
      cp: a.lines[0].cp,
      gap: Math.round((a.lines[0].cp - a.lines[1].cp) * sign),
      legalCount: chess.moves().length,
      ply,
    });
    process.stdout.write(`\r  labelled ${i + 1}/${all.length}  kept ${positions.length}`);
  }
  console.log("\n");

  // A battery is only useful if every category has enough positions to say
  // anything. Cap each one and report shortfalls loudly rather than shipping a
  // set that is 90% quiet middlegames.
  // Balance on category AND side to move. An unbalanced set cannot separate a
  // model that is weak overall from one that is weak with the black pieces.
  const buckets = new Map<string, BenchPosition[]>();
  for (const p of positions) {
    const side = p.fen.split(" ")[1];
    const key = `${p.category}|${side}`;
    const list = buckets.get(key) ?? [];
    list.push(p);
    buckets.set(key, list);
  }
  const half = Math.ceil(args.perCategory / 2);
  const balanced = [...buckets.values()].flatMap((list) => list.slice(0, half));

  const set = makeSet(args.id, balanced, {
    engine: engine.version,
    depth: args.depth,
    multipv: args.multipv,
  });
  engine.quit();

  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(args.out, JSON.stringify(set, null, 2) + "\n");

  const CATEGORIES = ["tactical", "positional", "blunder-avoidance", "endgame"];

  console.log(`set:      ${set.id}`);
  console.log(`hash:     ${set.hash}`);
  console.log(
    `positions ${balanced.length} of ${positions.length} labelled  (skipped ${skippedDecided} already decided)`,
  );
  let short = false;
  for (const c of CATEGORIES) {
    const inCat = balanced.filter((p) => p.category === c);
    const w = inCat.filter((p) => p.fen.split(" ")[1] === "w").length;
    const b = inCat.length - w;
    const flag = inCat.length < args.perCategory ? `  << short of ${args.perCategory}` : "";
    if (inCat.length < args.perCategory) short = true;
    console.log(
      `  ${c.padEnd(18)} ${String(inCat.length).padStart(4)}   (white ${w}, black ${b})${flag}`,
    );
  }
  const whiteTotal = balanced.filter((p) => p.fen.split(" ")[1] === "w").length;
  console.log(`  ${"side to move".padEnd(18)}        white ${whiteTotal}, black ${balanced.length - whiteTotal}`);
  if (short) {
    console.log("\nRun with more --games to fill the thin categories.");
  }
  console.log(`\nwritten to ${args.out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
