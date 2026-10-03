import { getKv, json } from "../../../lib/kv.js";
import { repo, ensureSeed } from "../../../lib/state.js";
import { deskPnl } from "../../../lib/desks.js";

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const revalidate = 0;

export async function GET() {
  const kv = getKv();
  await ensureSeed(kv, new Date().toISOString());
  const [market, openMap, closed] = await Promise.all([repo.market(kv), repo.openOps(kv), repo.closedOps(kv, 300)]);
  const open = Object.values(openMap) as any[];
  const venues: Record<string, { a: number; b: number }> = {};
  for (const [p, px] of Object.entries<number>(market?.prices || {})) venues[p] = { a: px, b: px };
  return json({
    venues: [], funding: market?.lastTick?.funding ?? 0.01,
    arbOpen: open.filter(o => o.desk === "arbitraje"),
    derivadosOpen: open.filter(o => o.desk === "derivados").length,
    hedge: open.find(o => o.desk === "cobertura") || null,
    signal: "-",
    pnl: deskPnl([...closed, ...open]),
  });
}
