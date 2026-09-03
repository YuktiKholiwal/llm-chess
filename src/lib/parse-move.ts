/**
 * Extracts the model's chosen move from its response. Models are told to emit
 * <move>SAN</move>; the fallbacks catch the common near-misses (fenced tag,
 * bare SAN on the last line under a "## Move" heading) so a formatting slip
 * doesn't cost a retry. Legality is checked separately by chess.js.
 */
const SAN = String.raw`O-O-O|O-O|[KQRBN][a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?|[a-h](?:x[a-h])?[1-8](?:=[QRBN])?[+#]?`;

export function parseMove(text: string): string | null {
  const tagged = [...text.matchAll(/<move>\s*([^<\n]+?)\s*<\/move>/gi)];
  if (tagged.length) return clean(tagged[tagged.length - 1][1]);

  // No tag: look under the "## Move" heading first, then the whole response.
  const scopes = [text.split(/##\s*Move/i).slice(1).join("\n"), text];
  for (const scope of scopes) {
    if (!scope.trim()) continue;
    const hits = [...scope.matchAll(new RegExp(String.raw`\b(${SAN})\b`, "g"))];
    if (hits.length) return clean(hits[hits.length - 1][1]);
  }
  return null;
}

function clean(s: string): string {
  return s
    .trim()
    .replace(/^["'`*\s]+|["'`*.,\s]+$/g, "")
    .replace(/\s+/g, "");
}

/** Everything before "## Move" is the visible, provider-symmetric analysis. */
export function extractAnalysis(text: string): string {
  return text
    .split(/##\s*Move/i)[0]
    .replace(/^\s*##\s*Analysis\s*/i, "")
    .trim();
}

/**
 * The model's own assessment of the position, in centipawns from White's
 * perspective. Accepts "+1.2", "-0.5", "0.0", "M3", "-M3". Returns null when
 * the model omitted or mangled the tag -- that omission is itself recorded,
 * since format compliance is a measured property.
 */
export function parseEval(text: string): number | null {
  const tagged = [...text.matchAll(/<eval>\s*([^<\n]+?)\s*<\/eval>/gi)];
  const raw = tagged.length
    ? tagged[tagged.length - 1][1]
    : (/##\s*Evaluation\s*\n+\s*([+-]?(?:M\s*\d+|\d+(?:\.\d+)?))/i.exec(text)?.[1] ?? null);
  if (raw === null) return null;

  const cleaned = raw.trim().replace(/[`*"']/g, "").replace(/\s+/g, "");

  const mate = /^([+-]?)M(\d+)$/i.exec(cleaned);
  if (mate) {
    const n = Number(mate[2]);
    const sign = mate[1] === "-" ? -1 : 1;
    // Same convention the engine wrapper uses, so the two are comparable.
    return sign * (10000 - n * 10);
  }

  const pawns = Number(cleaned);
  if (!Number.isFinite(pawns)) return null;
  // Guard against a model emitting centipawns instead of pawns.
  if (Math.abs(pawns) > 100) return null;
  return Math.round(pawns * 100);
}
