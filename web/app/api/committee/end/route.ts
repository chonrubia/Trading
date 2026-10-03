import { getKv, json } from "../../../../lib/kv.js";
import { repo, ensureSeed } from "../../../../lib/state.js";
import { fundExposure } from "../../../../lib/risk.js";

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const revalidate = 0;

export async function POST() {
  const kv = getKv();
  await ensureSeed(kv, new Date().toISOString());
  const [committee, meta, agentsMap, openMap] = await Promise.all([
    repo.committee(kv), repo.meta(kv), repo.agents(kv), repo.openOps(kv),
  ]);
  if (!committee?.active) return json({ active: false });
  const traders = Object.values(agentsMap).filter((a: any) => a.role === "Trader").sort((a: any, b: any) => b.pnl - a.pnl);
  const top = traders.slice(0, 3);
  const summary = {
    id: `meet-${Date.now()}`,
    topic: committee.topic, ended_at: new Date().toISOString(), auto: false,
    patrimonio: Math.round(meta.equity), dayPnl: Math.round(meta.dayPnl * 100) / 100,
    exposure: fundExposure(Object.values(openMap) as any, meta.equity),
    top3: top.map((t: any) => ({ name: t.name, setup: t.strategy, pnl: Math.round(t.pnl * 100) / 100 })),
    decisions: [
      `Capital protegido: exposición ${fundExposure(Object.values(openMap) as any, meta.equity)}% dentro de límite`,
      top[0] ? `Refuerzo a ${top[0].name} (${top[0].strategy}) por liderar ranking` : "Sin datos de ranking",
      "Comité cerrado por el gestor: mantener operativa con prudencia",
    ],
    messages: (committee.log || []).length,
  };
  await repo.pushMeeting(kv, summary);
  await repo.saveCommittee(kv, { active: false, topic: "", started_at: null, ticks: 0, backup: {}, log: [] });
  const first = Object.values(agentsMap)[0] as any;
  const msg = { id: `m-c-${Date.now()}`, channel_id: "c-general", from_agent_id: first.id, text: `Comité cerrado. Conclusiones: ${summary.decisions.join(" · ")}`, kind: "alerta", created_at: new Date().toISOString() };
  await repo.pushMsg(kv, msg);
  await repo.pushAudit(kv, { ts: new Date().toISOString(), ev: "committee.end", topic: summary.topic });
  return json(summary);
}
