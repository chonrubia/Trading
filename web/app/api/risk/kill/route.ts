import { getKv, json, body } from "../../../../lib/kv.js";
import { repo, ensureSeed } from "../../../../lib/state.js";
import { loadEngine, saveEngine } from "../../../../lib/engine.js";
import { closePosition, round2 } from "../../../../lib/accounting.js";

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const revalidate = 0;

export async function POST(req: Request) {
  const kv = getKv();
  await ensureSeed(kv, new Date().toISOString());
  const { active } = await body<{ active: boolean }>(req);
  const nowIso = new Date().toISOString();
  const s = await loadEngine(kv);
  s.meta.kill = !!active;
  if (active) {
    const prices = s.market?.prices || {};
    for (const p of Object.values(s.openOps)) {
      const px = prices[p.pair] || p.entry;
      const out = closePosition(s.account, p, px, "kill switch", nowIso);
      s.account = out.account;
      s.closed.push(out.trade);
      delete s.openOps[p.id];
      const ag = s.agents[out.trade.agent_id];
      if (ag) { ag.pnl = round2((ag.pnl || 0) + out.trade.pnl); ag.trades_count = (ag.trades_count || 0) + 1; ag.status = "analizando"; }
      s.audit.push({ ts: nowIso, ev: "op.close", id: out.trade.id, reason: "kill switch", pnl: out.trade.pnl });
    }
    s.meta.halt_reason = "kill switch manual";
  } else {
    s.meta.halt_reason = "";
  }
  s.audit.push({ ts: nowIso, ev: "risk.kill", active: !!active });
  await saveEngine(kv, s);
  const msg = {
    id: `m-kill-${Date.now()}`, channel_id: "c-general", from_agent_id: "a-002",
    text: active ? "Riesgos: KILL-SWITCH activado. Posiciones spot cerradas a mercado; no se abre nada." : "Riesgos: kill-switch liberado. Se reanuda el paper real.",
    kind: "alerta", created_at: nowIso,
  };
  await repo.pushMsg(kv, msg);
  return json({ kill: s.meta.kill, cash: s.account.cash, equity: s.meta.equity });
}
