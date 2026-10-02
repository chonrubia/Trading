import { getKv, json } from "../../../lib/kv.js";
import { repo, ensureSeed } from "../../../lib/state.js";

export async function GET() {
  const kv = getKv();
  await ensureSeed(kv, new Date().toISOString());
  const agents = Object.values(await repo.agents(kv));
  const sorted = agents.filter((a: any) => a.role === "Trader").sort((x: any, y: any) => y.pnl - x.pnl);
  const meta = await repo.meta(kv);
  return json(sorted.slice(0, 50).map((a: any, i: number) => ({
    rank: i + 1, id: a.id, name: a.name, setup: a.strategy, pair: a.pair,
    pnl: a.pnl, hoy: a.pnl, win_rate: a.win_rate, suspended: meta.suspended.includes(a.id),
  })));
}
