import { getKv, json } from "../../../lib/kv.js";
import { repo, ensureSeed, metaStale } from "../../../lib/state.js";

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const revalidate = 0;

export async function GET() {
  const kv = getKv();
  await ensureSeed(kv, new Date().toISOString());
  const [market, meta] = await Promise.all([repo.market(kv), repo.meta(kv)]);
  if (!market?.lastTick) {
    return json({ source: "binance", prices: {}, stale: true, error: "sin datos reales todavía" }, 503);
  }
  const stale = metaStale(meta);
  return json({
    ...market.lastTick,
    stale,
    change24h: market.change24h || {},
    age_ms: meta.last_tick_at ? Math.max(0, Date.now() - Date.parse(meta.last_tick_at)) : null,
  });
}
