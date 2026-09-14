import { existsSync, readdirSync, readFileSync } from "node:fs";
import { cache } from "react";
import type { PublishedRun } from "./leaderboard";

/**
 * Published benchmark runs, committed to the repo so the board builds
 * statically. Read by the scorecard and by the home page, which quotes the
 * headline figure -- one loader so the two can never disagree about it.
 */

const RESULTS_DIR = "bench/results";

export const loadPublishedRuns = cache((): PublishedRun[] => {
  if (!existsSync(RESULTS_DIR)) return [];
  return readdirSync(RESULTS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(`${RESULTS_DIR}/${f}`, "utf8")) as PublishedRun)
    .sort((a, b) => a.publishedAt.localeCompare(b.publishedAt));
});
