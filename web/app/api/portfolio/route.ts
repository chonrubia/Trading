import { getKv, json } from "../../../lib/kv.js";
import { repo, ensureSeed } from "../../../lib/state.js";
import { fundExposure } from "../../../lib/risk.js";

export async function GET() {
  const kv = getKv();
  await ensureSeed(kv, new Date().toISOString());
  const [meta, openMap, closed] = await Promise.all([repo.meta(kv), repo.openOps(kv), repo.closedOps(kv, 300)]);
  const open = Object.values(openMap);
  const costs = closed.reduce((s: number, o: any) => s + (o.fees || 0), 0);
  return json({
    patrimonio: Math.round(meta.equity * 100) / 100,
    resultado_hoy: Math.round(meta.dayPnl * 100) / 100,
    caida: meta.drawdown,
    exposicion_bruta: fundExposure(open as any, meta.equity),
    posiciones: open.length,
    costes_pagados: Math.round(costs * 100) / 100,
    objetivo: 50,
    progreso: Math.round((meta.dayPnl / 50) * 1000) / 10 + "%",
    freno_riesgos: false,
    mode: "PAPEL realista · sin dinero demo",
    kill: meta.kill,
  });
}
