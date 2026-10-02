import { getKv, json, body } from "../../../lib/kv.js";
import { withLock } from "../../../lib/store.js";
import { repo, ensureSeed } from "../../../lib/state.js";
import { loadEngine, saveEngine, step } from "../../../lib/engine.js";
import { seedRand, hashStr } from "../../../lib/rng.js";

// Un tick del motor. Solo cron (CRON_SECRET) o manual local.
// Idempotente por slot: repetir el mismo slot no duplica nada.
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET || "";
  if (secret) {
    const auth = req.headers.get("authorization") || "";
    if (auth !== `Bearer ${secret}`) return json({ error: "unauthorized" }, 401);
  }
  const kv = getKv();
  await ensureSeed(kv, new Date().toISOString());
  const { slot: slotIn } = await body<{ slot?: string }>(req);
  const nowIso = new Date().toISOString();
  const slot = slotIn || nowIso.slice(0, 16);
  const res = await withLock(kv, `lock:step:${slot}`, 55000, async () => {
    const done = await kv.get(`step:done:${slot}`);
    if (done) return { dedup: true as boolean, tickN: -1, events: [] as any[] };
    const s = await loadEngine(kv);
    const rnd = seedRand(hashStr(slot));
    const out = step(s, { slot, nowIso, rnd });
    await saveEngine(kv, out.state);
    await kv.set(`step:done:${slot}`, "1");
    return { dedup: false, tickN: out.state.meta.tickN, events: out.events };
  });
  if (res.locked) return json({ locked: true, slot }, 429);
  return json({ slot, ...(res.result as object) });
}
