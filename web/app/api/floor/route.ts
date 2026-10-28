import { getKv, json } from "../../../lib/kv.js";
import { repo, ensureSeed, metaStale } from "../../../lib/state.js";
import { summarize, markPosition } from "../../../lib/accounting.js";

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const revalidate = 0;

export async function GET() {
  const kv = getKv();
  await ensureSeed(kv, new Date().toISOString());
  const [meta, account, market, openMap, closed, blocked, msgs, committee, agentsMap] = await Promise.all([
    repo.meta(kv), repo.account(kv), repo.market(kv), repo.openOps(kv),
    repo.closedOps(kv, 2000), repo.blockedOps(kv, 200),
    repo.messages(kv, "c-general", 20), repo.committee(kv), repo.agents(kv),
  ]);
  const prices = market?.prices || {};
  const open = (Object.values(openMap) as any[]).map(o => markPosition(o, prices[o.pair] || o.entry));
  const sum = summarize(account, open, prices);
  const names: Record<string, string> = {};
  const agentsLite = Object.values(agentsMap).map((a: any) => {
    names[a.id] = a.name;
    return { id: a.id, status: a.status, pnl: a.pnl, x: a.x, y: a.y };
  });
  return json({
    tick: market?.lastTick || null, tickN: meta.tickN,
    equity: sum.equity, dayPnl: meta.dayPnl, drawdown: meta.drawdown,
    exposure: sum.exposurePct, realized: sum.realized, unrealized: sum.unrealized,
    cash: sum.cash, fees: sum.feesPaid,
    base: sum.base, stale: metaStale(meta), market_source: "binance",
    last_candle_ts: meta.last_candle_ts || null,
    engine: "v2", mode: "paper-real", dayHalt: !!meta.dayHalt,
    kill: meta.kill, committee: !!committee?.active,
    counts: { open: open.length, closed: closed.length, blocked: blocked.length, agents: Object.keys(agentsMap).length },
    msgs: msgs.map((m: any) => ({ ...m, from: names[m.from_agent_id] || "Tú" })),
    openOps: open.slice(-20),
    agents: agentsLite,
  });
}
