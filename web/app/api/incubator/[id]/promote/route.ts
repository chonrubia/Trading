import { getKv, json } from "../../../../../lib/kv.js";
import { repo, ensureSeed } from "../../../../../lib/state.js";

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const revalidate = 0;

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const kv = getKv();
  await ensureSeed(kv, new Date().toISOString());
  const all = await repo.strategies(kv);
  const s = all[params.id];
  if (!s || s.status !== "lista") return json({ error: "no está lista (requiere status=lista)" }, 400);
  const agentsMap = await repo.agents(kv);
  const ids = Object.keys(agentsMap);
  const aid = `a-${String(ids.length + 1).padStart(3, "0")}`;
  const trading = Object.values(agentsMap).find((a: any) => a.department_id === "d-trading") as any;
  const agent = {
    id: aid, name: `Incubada ${s.pair} ${s.style} #${s.id}`, role: "Trader",
    department_id: trading?.department_id || "d-trading",
    avatar_seed: 1000 + ids.length, strategy: s.name, pair: s.pair,
    timeframe: s.tf, style: s.style, risk_level: 2, leverage: 2, capital_assigned: 25,
    status: "analizando", mood: "enfocado", incubated: true, level_risk: 2, level_ta: 2,
    studying: "Gestión de riesgo", pnl: 0, win_rate: s.backtest?.win ?? 50,
    profit_factor: s.backtest?.pf ?? 1, drawdown: 0, trades_count: 0,
    x: 0.45, y: 0.55, last_reason: `Incubada de ${s.name}: supera incubación y recibe 25€.`,
  };
  await repo.saveAgent(kv, agent);
  s.status = "activa"; s.agent_id = aid; s.activated_at = new Date().toISOString();
  await repo.saveStrategy(kv, s);
  await repo.pushMemory(kv, { id: `mem-${Date.now()}`, ts: new Date().toISOString(), author: "Laboratorio", dept: "lab", pair: s.pair, text: `${s.name} supera incubación y recibe 25€ de capital.`, kind: "incubacion" });
  await repo.pushAudit(kv, { ts: new Date().toISOString(), ev: "incubator.promote", id: s.id, agent: aid });
  return json(s);
}
