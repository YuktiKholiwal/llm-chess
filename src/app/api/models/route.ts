/** Per-token USD rates straight from the Gateway catalogue, cached hourly. */
export const revalidate = 3600;

export async function GET() {
  try {
    const res = await fetch("https://ai-gateway.vercel.sh/v1/models", {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return Response.json({}, { status: 200 });
    const json = (await res.json()) as {
      data?: { id: string; pricing?: { input?: string; output?: string } }[];
    };
    const out: Record<string, { input: number; output: number }> = {};
    for (const m of json.data ?? []) {
      const i = Number(m.pricing?.input);
      const o = Number(m.pricing?.output);
      if (Number.isFinite(i) && Number.isFinite(o)) out[m.id] = { input: i, output: o };
    }
    return Response.json(out);
  } catch {
    // A missing price list must never break the arena.
    return Response.json({}, { status: 200 });
  }
}
