/**
 * Headless Stockfish for the benchmark runner.
 *
 * The browser engine (src/lib/engine.ts) drives a Web Worker and cannot run
 * outside a page. This is the same UCI conversation over the Node build of the
 * WASM binary, plus MultiPV -- classifying a position as tactical requires
 * knowing how far ahead the best move is of the second-best, which a single
 * principal variation cannot tell you.
 */

export type EngineLine = {
  /** Best move for this line, in UCI (e.g. "e2e4"). */
  move: string;
  /** Centipawns, always from White's perspective. */
  cp: number;
  /** Mate distance from White's perspective, or null. */
  mate: number | null;
  /** Principal variation in UCI. */
  pv: string[];
};

export type Analysis = {
  /** Ranked best-first from the side-to-move's point of view. */
  lines: EngineLine[];
  depth: number;
};

export const MATE_CP = 10000;

/** Mate scores share the browser engine's convention so the two agree. */
export function mateToCp(mate: number): number {
  return mate > 0 ? MATE_CP - mate * 10 : -MATE_CP - mate * 10;
}

type Raw = { cp: number; mate: number | null; pv: string[]; depth: number };

/**
 * The WASM bundle initialises module-global state and cannot be started twice
 * in one process. Tracked here so a second instance fails with an explanation
 * rather than a bare "INIT_ENGINE(...) is not a function".
 */
let engineClaimed = false;

export class NodeEngine {
  private engine: { sendCommand: (c: string) => void; listener?: (l: unknown) => void } | null =
    null;
  private lines: string[] = [];
  private handlers: ((line: string) => void)[] = [];
  private chain: Promise<unknown> = Promise.resolve();
  private currentMultiPv = 1;
  private idString = "unknown";

  /** Identifies the exact engine build, for the run manifest. */
  get version(): string {
    return this.idString;
  }

  async init(): Promise<void> {
    if (this.engine) return;
    if (engineClaimed) {
      throw new Error(
        "Stockfish can only be initialised once per process. Reuse the existing " +
          "NodeEngine instance rather than constructing another.",
      );
    }
    engineClaimed = true;

    // The Stockfish WASM bundle nulls out globalThis.fetch when it detects
    // Node, so that it can fall back to XMLHttpRequest for loading the .wasm.
    // Anything sharing the process -- notably the AI SDK -- then fails with
    // "fetch is not a function". Restore it once the engine is up.
    const savedFetch = globalThis.fetch;
    const { default: initEngine } = await import("stockfish");
    const engine = await initEngine(
      "node_modules/stockfish/bin/stockfish-18-lite-single.js",
    );
    if (globalThis.fetch !== savedFetch) globalThis.fetch = savedFetch;

    engine.listener = (raw: unknown) => {
      const line = String(raw ?? "");
      this.lines.push(line);
      if (line.startsWith("id name ")) this.idString = line.slice(8).trim();
      for (const h of this.handlers) h(line);
    };
    this.engine = engine;

    await this.command("uci", (l) => l.includes("uciok"));
    await this.command("isready", (l) => l.includes("readyok"));
  }

  private send(cmd: string) {
    if (!this.engine) throw new Error("engine not initialised");
    this.engine.sendCommand(cmd);
  }

  /** Sends a command and resolves on the first line matching `done`. */
  private command(
    cmd: string,
    done: (line: string) => boolean,
    timeoutMs = 60000,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.handlers = this.handlers.filter((h) => h !== handler);
        reject(new Error(`engine timeout after ${timeoutMs}ms on: ${cmd}`));
      }, timeoutMs);

      const handler = (line: string) => {
        if (!done(line)) return;
        clearTimeout(timer);
        this.handlers = this.handlers.filter((h) => h !== handler);
        resolve(line);
      };
      this.handlers.push(handler);
      this.send(cmd);
    });
  }

  /**
   * Searches one position. Calls are queued: UCI is a single stateful
   * conversation and interleaving two searches corrupts both.
   */
  analyze(
    fen: string,
    opts: { depth?: number; multipv?: number } = {},
  ): Promise<Analysis> {
    const depth = opts.depth ?? 14;
    const multipv = opts.multipv ?? 1;

    const run = async (): Promise<Analysis> => {
      await this.init();
      const whiteToMove = fen.split(" ")[1] === "w";

      if (multipv !== this.currentMultiPv) {
        this.send(`setoption name MultiPV value ${multipv}`);
        this.currentMultiPv = multipv;
      }

      const best = new Map<number, Raw>();
      let seenDepth = 0;

      const collect = (line: string) => {
        if (!line.startsWith("info") || !line.includes("score")) return;
        const idx = Number(/\bmultipv (\d+)/.exec(line)?.[1] ?? 1);
        const d = Number(/\bdepth (\d+)/.exec(line)?.[1] ?? 0);
        const cpM = /score cp (-?\d+)/.exec(line);
        const mateM = /score mate (-?\d+)/.exec(line);
        const pvM = /\bpv (.+)$/.exec(line);
        if (!pvM) return;

        // Keep the deepest report for each multipv slot.
        const prev = best.get(idx);
        if (prev && prev.depth > d) return;

        const mate = mateM ? Number(mateM[1]) : null;
        const cp = cpM ? Number(cpM[1]) : mate !== null ? mateToCp(mate) : 0;
        best.set(idx, { cp, mate, pv: pvM[1].trim().split(/\s+/), depth: d });
        if (d > seenDepth) seenDepth = d;
      };

      this.handlers.push(collect);
      this.send("ucinewgame");
      this.send(`position fen ${fen}`);
      try {
        await this.command(`go depth ${depth}`, (l) => l.startsWith("bestmove"));
      } finally {
        this.handlers = this.handlers.filter((h) => h !== collect);
      }

      // UCI scores are relative to the side to move; normalise to White so all
      // stored evaluations share one frame of reference.
      const sign = whiteToMove ? 1 : -1;
      const lines: EngineLine[] = [...best.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([, r]) => ({
          move: r.pv[0],
          cp: r.cp * sign,
          mate: r.mate === null ? null : r.mate * sign,
          pv: r.pv,
        }));

      return { lines, depth: seenDepth };
    };

    const next = this.chain.then(run, run);
    this.chain = next.catch(() => {});
    return next;
  }

  quit(): void {
    try {
      this.send("quit");
    } catch {
      // Already gone.
    }
    // Deliberately does not release the process-wide claim: the WASM module
    // stays loaded, so a fresh instance still could not start.
    this.engine = null;
    this.handlers = [];
    this.lines = [];
  }
}
