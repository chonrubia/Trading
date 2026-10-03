import { getKv, json } from "../../../lib/kv.js";
import { repo, ensureSeed } from "../../../lib/state.js";
import { setupStats } from "../../../lib/stats.js";

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const revalidate = 0;

export async function GET() {
  const kv = getKv();
  await ensureSeed(kv, new Date().toISOString());
  return json(setupStats(await repo.closedOps(kv, 300)).slice(0, 20));
}
