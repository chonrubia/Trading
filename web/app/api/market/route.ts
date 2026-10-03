import { getKv, json } from "../../../lib/kv.js";
import { repo, ensureSeed } from "../../../lib/state.js";

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const revalidate = 0;

export async function GET() {
  const kv = getKv();
  await ensureSeed(kv, new Date().toISOString());
  const market = await repo.market(kv);
  return json(market?.lastTick || { prices: {}, funding: 0, fear_greed: 50, risk_mode: "RISK-ON", ts: new Date().toISOString() });
}
