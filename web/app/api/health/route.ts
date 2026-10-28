import { getKv, json } from "../../../lib/kv.js";
import { repo, ensureSeed, metaStale } from "../../../lib/state.js";

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const revalidate = 0;

export async function GET() {
  const kv = getKv();
  await ensureSeed(kv, new Date().toISOString());
  const [meta, market] = await Promise.all([repo.meta(kv), repo.market(kv)]);
  const lastCandle = meta.last_candle_ts || market?.lastCandleTs || "";
  const lastTickMs = meta.last_tick_at ? Date.parse(meta.last_tick_at) : NaN;
  const ageMs = Number.isFinite(lastTickMs) ? Math.max(0, Date.now() - lastTickMs) : null;
  const stale = metaStale(meta);
  return json({
    ok: !stale,
    engine: "v2",
    mode: "paper-real",
    market: "spot",
    market_source: "binance",
    shorting: false,
    max_leverage: 1,
    last_candle_ts: lastCandle || null,
    last_tick_at: meta.last_tick_at || null,
    age_s: ageMs === null ? null : Math.round(ageMs / 1000),
    stale,
    tickN: meta.tickN,
    equity: meta.equity,
    dayPnl: meta.dayPnl,
    kill: meta.kill,
    dayHalt: meta.dayHalt,
    ts: new Date().toISOString(),
  });
}
