import { getKv, json, body } from "../../../lib/kv.js";
import { withLock } from "../../../lib/store.js";
import { ensureSeed } from "../../../lib/state.js";
import { loadEngine, saveEngine, step } from "../../../lib/engine.js";
import { seedRand, hashStr } from "../../../lib/rng.js";
import { fetchRealMarket } from "../../../lib/market-real.js";

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const revalidate = 0;
export const maxDuration = 60;

// Un tick del motor. Solo cron (CRON_SECRET) o manual local.
// Idempotente por slot. Sin datos reales frescos no avanza: 503.
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET || "";
  if (process.env.VERCEL && !secret) return json({ error: "configura CRON_SECRET" }, 503);
  if (secret) {
    const auth = req.headers.get("authorization") || "";
    if (auth !== `Bearer ${secret}`) return json({ error: "unauthorized" }, 401);
  }
  const kv = getKv();
  await ensureSeed(kv, new Date().toISOString());
  const { slot: slotIn } = await body<{ slot?: string }>(req);
  const nowIso = new Date().toISOString();
  const slot = slotIn || nowIso.slice(0, 16);

  const market = await fetchRealMarket(fetch, Date.now()).catch((e: any) => ({ error: String(e?.message || e) }));
  if ("error" in market) return json({ error: "binance", detail: market.error, stale: true }, 503);
  if (market.stale) return json({ error: "stale", detail: `último ticker con más de 15 min`, age_ms: market.ageMs, stale: true }, 503);

  const res = await withLock(kv, `lock:step:${slot}`, 55000, async () => {
    const done = await kv.get(`step:done:${slot}`);
    if (done) return { dedup: true as boolean, tickN: -1, events: [] as any[] };
    const s = await loadEngine(kv);
    const rnd = seedRand(hashStr(slot));
    const out = step(s, { slot, nowIso, rnd, market });
    await saveEngine(kv, out.state);
    await kv.set(`step:done:${slot}`, "1");
    return {
      dedup: false, tickN: out.state.meta.tickN, events: out.events,
      market_source: "binance", last_candle_ts: market.lastCandleTs, age_ms: market.ageMs,
    };
  });
  if (res.locked) return json({ locked: true, slot }, 429);
  return json({ slot, ...(res.result as object) });
}
