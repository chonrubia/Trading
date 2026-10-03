import { getKv, json, body } from "../../../../lib/kv.js";
import { withLock } from "../../../../lib/store.js";
import { repo, ensureSeed } from "../../../../lib/state.js";
import { checkOperation, fundExposure } from "../../../../lib/risk.js";
import { costPerSide } from "../../../../lib/costs.js";

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const revalidate = 0;

export async function POST(req: Request) {
  const kv = getKv();
  await ensureSeed(kv, new Date().toISOString());
  const { agent_id, pair, side = "LONG", size, leverage } = await body<any>(req);
  const [agentsMap, meta, market, openMap] = await Promise.all([
    repo.agents(kv), repo.meta(kv), repo.market(kv), repo.openOps(kv),
  ]);
  const traders = Object.values(agentsMap).filter((a: any) => a.role === "Trader") as any[];
  const agent = (agentsMap as any)[agent_id] || traders[0];
  if (!agent) return json({ error: "sin agentes" }, 400);
  const px = market?.prices?.[pair || agent.pair] ?? 100;
  const useSize = size || Math.round((20 / px) * 10000) / 10000;
  const prop = { pair: pair || agent.pair, side, entry: px, size: useSize, leverage: leverage || agent.leverage };
  const open = Object.values(openMap) as any[];
  const verdict = checkOperation(
    { id: agent.id, name: agent.name, leverage: agent.leverage, pnl: agent.pnl },
    prop,
    { equity: meta.equity, killSwitch: meta.kill, suspended: meta.suspended, openOps: open }
  );
  const rate = costPerSide(prop.pair, "spot");
  const res = await withLock(kv, "lock:propose", 5000, async () => {
    const m = await repo.meta(kv);
    const op = {
      id: `op-${m.opN}`, agent_id: agent.id, agent_name: agent.name, strategy: agent.strategy, ...prop,
      size: verdict.size || prop.size, leverage: verdict.leverage || prop.leverage,
      status: verdict.approved ? "abierta" : "bloqueada", pnl: 0, life: 0,
      maxLife: 40 + Math.floor(Math.random() * 40), risk_note: verdict.reason,
      estCosts: Math.round(useSize * px * 2 * rate * 100) / 100,
      opened_at: new Date().toISOString(),
    };
    m.opN += 1;
    await repo.saveMeta(kv, m);
    if (verdict.approved) await repo.saveOpenOp(kv, op);
    else await repo.pushBlocked(kv, op);
    await repo.pushAudit(kv, { ts: new Date().toISOString(), ev: "op.propose", id: op.id, agent: agent.id, status: op.status });
    return op;
  });
  if (res.locked) return json({ error: "operación en curso, reintenta" }, 429);
  void fundExposure;
  return json(res.result);
}
