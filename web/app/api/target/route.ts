import { getKv, json } from "../../../lib/kv.js";
import { repo, ensureSeed } from "../../../lib/state.js";

export async function GET() {
  const kv = getKv();
  await ensureSeed(kv, new Date().toISOString());
  const [meta, days] = await Promise.all([repo.meta(kv), repo.targetDays(kv)]);
  const hist = Object.entries(days).map(([day, v]: any) => ({ day, ...v })).sort((a: any, b: any) => (a.day < b.day ? 1 : -1)).slice(0, 14);
  return json({
    target: 50, today: meta.today, dayPnl: Math.round(meta.dayPnl * 100) / 100,
    progress: Math.round((meta.dayPnl / 50) * 1000) / 10 + "%",
    hit: meta.dayPnl >= 50, history: hist, hits: hist.filter(d => d.hit).length,
  });
}
