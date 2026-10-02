import { getKv, json } from "../../../lib/kv.js";
import { repo, ensureSeed } from "../../../lib/state.js";
import { fundExposure } from "../../../lib/risk.js";

export async function GET() {
  const kv = getKv();
  await ensureSeed(kv, new Date().toISOString());
  const [depts, agentsMap, meta, openMap] = await Promise.all([
    repo.departments(kv), repo.agents(kv), repo.meta(kv), repo.openOps(kv),
  ]);
  const counts: Record<string, number> = {};
  Object.values(agentsMap).forEach((a: any) => (counts[a.department_id] = (counts[a.department_id] || 0) + 1));
  const exp = fundExposure(Object.values(openMap) as any, meta.equity);
  return json(depts.map((d: any) => ({
    ...d,
    headcount: counts[d.id] || 0,
    riesgos: {
      exposicion_bruta: `${exp}% / 150%`, exposicion_neta: `${exp}%`,
      caida_max: `${meta.drawdown}%`, resultado_dia: `${Math.round(meta.dayPnl)}€ (sin límite)`,
      estado: meta.kill ? "DETENIDO" : "Normal",
    },
  })));
}
