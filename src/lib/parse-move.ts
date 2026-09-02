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
