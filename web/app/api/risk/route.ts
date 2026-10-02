import { getKv, json } from "../../../lib/kv.js";
import { repo, ensureSeed } from "../../../lib/state.js";
import { FUND_LIMITS, fundExposure } from "../../../lib/risk.js";

export async function GET() {
  const kv = getKv();
  await ensureSeed(kv, new Date().toISOString());
  const [meta, openMap, closed, blocked] = await Promise.all([
    repo.meta(kv), repo.openOps(kv), repo.closedOps(kv, 300), repo.blockedOps(kv, 100),
  ]);
  const open = Object.values(openMap);
  return json({
    limits: FUND_LIMITS, kill: meta.kill,
    exposure: fundExposure(open as any, meta.equity),
    dayPnl: Math.round(meta.dayPnl * 100) / 100, drawdown: meta.drawdown,
    open: open.length, blocked: blocked.length, suspended: meta.suspended,
  });
}
