import { getKv, json, body } from "../../../../lib/kv.js";
import { withLock } from "../../../../lib/store.js";
import { repo, ensureSeed } from "../../../../lib/state.js";
import { checkSpotOperation, SPOT_LIMITS } from "../../../../lib/risk.js";
import { openPosition, summarize } from "../../../../lib/accounting.js";
import { stopsFor } from "../../../../lib/strategies.js";
import { PAIRS } from "../../../../lib/binance.js";

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const revalidate = 0;

export async function POST(req: Request) {
  const kv = getKv();
  await ensureSeed(kv, new Date().toISOString());
  const { agent_id, pair, side = "LONG", notional } = await body<any>(req);
  if (String(side).toUpperCase() !== "LONG") {
    return json({ error: "spot 1x: solo se permiten propuestas LONG; un SHORT solo puede cerrar una posición" }, 400);
  }
  const pairKey = String(pair || "BTC").toUpperCase();
  if (!PAIRS.includes(pairKey as any)) return json({ error: `par no soportado: ${pairKey}` }, 400);

  const res = await withLock(kv, "lock:propose", 8000, async () => {
    const [agentsMap, meta, account, market, openMap] = await Promise.all([
      repo.agents(kv), repo.meta(kv), repo.account(kv), repo.market(kv), repo.openOps(kv),
    ]);
    if (!market?.lastTick) return { error: "sin datos reales frescos", status: 503 };
    if (meta.stale) return { error: "mercado stale: no se opera", status: 503 };
    const traders = Object.values(agentsMap).filter((a: any) => a.role === "Trader") as any[];
    const agent = (agentsMap as any)[agent_id] || traders[0];
    if (!agent) return { error: "sin agentes", status: 400 };
    const price = market.prices?.[pairKey];
    if (!(price > 0)) return { error: `precio real no disponible para ${pairKey}`, status: 503 };
    const open = Object.values(openMap) as any[];
    const sum = summarize(account, open as any, market.prices || {});
    const wanted = Math.min(SPOT_LIMITS.max_order_eur, Math.max(SPOT_LIMITS.min_order_eur, Number(notional) || 10));
    const verdict = checkSpotOperation({
      pair: pairKey, side: "LONG", notional: wanted, price,
      openCount: open.length, cash: sum.cash, dayPnl: meta.dayPnl,
      exposurePct: sum.exposurePct, drawdown: meta.drawdown,
      killSwitch: meta.kill, dayHalt: meta.dayHalt, suspended: meta.suspended.includes(agent.id),
    });
    const opId = `op-manual-${meta.opN}`;
    meta.opN += 1;
    if (!verdict.approved) {
      const blocked = {
        id: opId, agent_id: agent.id, agent_name: agent.name, strategy: agent.strategy,
        pair: pairKey, side: "LONG", entry: price, size: wanted / price, leverage: 1,
        status: "bloqueada", pnl: 0, risk_note: verdict.reason, opened_at: new Date().toISOString(),
      };
      await repo.saveMeta(kv, meta);
      await repo.pushBlocked(kv, blocked);
      await repo.pushAudit(kv, { ts: new Date().toISOString(), ev: "op.propose", id: opId, status: "bloqueada", reason: verdict.reason });
      return { blocked: true, ...blocked };
    }
    const st = stopsFor(price, price * 0.008, 1);
    const opened = openPosition(account, {
      id: opId, agent_id: agent.id, agent_name: agent.name, strategy: agent.strategy,
      pair: pairKey, mid: price, notional: wanted, stop: st.stop, target: st.target,
      maxLife: 288, opened_at: new Date().toISOString(),
    });
    await repo.saveMeta(kv, meta);
    await repo.saveAccount(kv, opened.account);
    await repo.saveOpenOp(kv, opened.position);
    await repo.pushAudit(kv, { ts: new Date().toISOString(), ev: "op.propose", id: opId, agent: agent.id, status: "abierta", notional: wanted });
    await repo.pushMsg(kv, {
      id: `m-${Date.now()}`, channel_id: "c-general", from_agent_id: agent.id,
      text: `Propuesta humana aceptada: LONG ${pairKey} spot 1x ${wanted}€ a ${price}€.`, kind: "alerta", created_at: new Date().toISOString(),
    });
    return opened.position;
  });
  if (res.locked) return json({ error: "operación en curso, reintenta" }, 429);
  const r: any = res.result;
  if (r?.error) return json({ error: r.error }, Number(r.status) || 400);
  return json(r, 200);
}
