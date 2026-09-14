/**
 * Rate limits and provider hiccups are expected during a long match and must
 * not end the game -- they're retried with backoff. Auth and access failures
 * will never resolve on their own, so those stop the match immediately.
 */
export type ErrorKind = "transient" | "fatal";

const TRANSIENT_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
const TRANSIENT_TEXT =
  /rate.?limit|overloaded|too many requests|timeout|timed out|temporarily|try again|capacity|ECONNRESET|fetch failed/i;
const FATAL_TEXT =
  /do not have access|authentication|unauthorized|invalid api key|no authentication|not found|insufficient|billing|payment/i;

export function classifyError(err: unknown): {
  kind: ErrorKind;
  message: string;
} {
  const message =
    err instanceof Error ? err.message : typeof err === "string" ? err : String(err);

  // Fatal wins: "free tier ... rate-limited ... upgrade" reads as both, but no
  // amount of retrying fixes a plan that doesn't include the model.
  if (FATAL_TEXT.test(message)) return { kind: "fatal", message };

  const status = (err as { statusCode?: number; status?: number } | null)?.statusCode ??
    (err as { status?: number } | null)?.status;
  if (typeof status === "number" && TRANSIENT_STATUS.has(status)) {
    return { kind: "transient", message };
  }
  if (TRANSIENT_TEXT.test(message)) return { kind: "transient", message };

  return { kind: "fatal", message };
}
