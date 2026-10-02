import { getKv, json } from "../../../lib/kv.js";
import { repo, ensureSeed, FUND_BASE } from "../../../lib/state.js";
import { fundExposure } from "../../../lib/risk.js";

export async function GET() {
  const kv = getKv();
  await ensureSeed(kv, new Date().toISOString());
  const [meta, market, openMap, closed, blocked, msgs, committee, agentsMap] = await Promise.all([
    repo.meta(kv), repo.market(kv), repo.openOps(kv),
    repo.closedOps(kv, 300), repo.blockedOps(kv, 80),
    repo.messages(kv, "c-general", 20), repo.committee(kv), repo.agents(kv),
  ]);
  const open = Object.values(openMap);
  const names: Record<string, string> = {};
  const agentsLite = Object.values(agentsMap).map((a: any) => {
    names[a.id] = a.name;
    return { id: a.id, status: a.status, pnl: a.pnl, x: a.x, y: a.y };
  });
  return json({
    tick: market?.lastTick || null,
    equity: meta.equity, dayPnl: meta.dayPnl, drawdown: meta.drawdown,
    exposure: fundExposure(open as any, meta.equity),
    kill: meta.kill, committee: !!committee?.active,
    counts: { open: open.length, closed: closed.length, blocked: blocked.length, agents: Object.keys(agentsMap).length },
    msgs: msgs.map((m: any) => ({ ...m, from: names[m.from_agent_id] || "Tú" })),
    openOps: open.slice(-20),
    agents: agentsLite,
  });
}
