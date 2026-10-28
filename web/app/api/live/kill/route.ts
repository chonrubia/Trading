import { getKv, json } from "../../../../lib/kv.js";
import { ensureSeed, repo } from "../../../../lib/state.js";

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const revalidate = 0;

export async function POST() {
  const kv = getKv();
  await ensureSeed(kv, new Date().toISOString());
  const now = new Date().toISOString();
  await repo.saveLiveArm(kv, { armed: false, disarmed_at: now, by: "kill" });
  await repo.pushAudit(kv, { ts: now, ev: "live.kill" });
  return json({ armed: false, disarmed_at: now });
}
