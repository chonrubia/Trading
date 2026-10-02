import { getKv, json } from "../../../lib/kv.js";
import { repo, ensureSeed } from "../../../lib/state.js";

export async function GET() {
  const kv = getKv();
  await ensureSeed(kv, new Date().toISOString());
  const meta = await repo.meta(kv);
  return json({ ok: true, agents: Object.keys(await repo.agents(kv)).length, mode: "paper", fase: "web", tickN: meta.tickN, ts: new Date().toISOString() });
}
