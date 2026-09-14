/**
 * Next.js loads .env.local automatically; plain Node scripts do not. Without
 * this the benchmark runs to completion against an unauthenticated gateway and
 * records every position as a model failure.
 */
export function loadEnv(): void {
  for (const file of [".env.local", ".env"]) {
    try {
      process.loadEnvFile(file);
    } catch {
      // Absent or unreadable: fall through to the next candidate.
    }
  }
}
