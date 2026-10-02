import { getKv, json, body } from "../../../../lib/kv.js";
import { repo, ensureSeed } from "../../../../lib/state.js";
import { genHistory, metrics, robustness, runTrades, type Spec } from "../../../../lib/indicators.js";
import { seedRand } from "../../../../lib/rng.js";

const PAIRS = ["BTC", "ETH", "SOL", "XRP", "BNB", "DOGE", "ADA", "AVAX", "LINK"];
const TEMPLATES = [
  { style: "tendencia", tf: "1h", kind: "ema" },
  { style: "mean reversion", tf: "15m", kind: "rsi" },
  { style: "breakout", tf: "4h", kind: "donchian" },
  { style: "swing", tf: "1D", kind: "ema" },
  { style: "scalping", tf: "5m", kind: "rsi" },
] as Array<{ style: string; tf: string; kind: "ema" | "rsi" | "donchian" }>;

export async function POST(req: Request) {
  const kv = getKv();
  await ensureSeed(kv, new Date().toISOString());
  const { n = 3 } = await body<{ n?: number }>(req);
  const k = Math.min(10, Math.max(1, Number(n) || 3));
  const rnd = seedRand(Date.now() % 2147483647);
  const out: any[] = [];
  const existing = await repo.strategies(kv);
  let idx = Object.keys(existing).length + 1;
  for (let i = 0; i < k; i++) {
    const t = TEMPLATES[Math.floor(rnd() * TEMPLATES.length)];
    const pair = PAIRS[Math.floor(rnd() * PAIRS.length)];
    const span = t.kind === "ema" ? 12 : t.kind === "rsi" ? 14 : 40;
    const base = t.kind === "ema" ? 5 : t.kind === "rsi" ? 7 : 15;
    const p1 = base + Math.floor(rnd() * span);
    const spec: Spec & { pair: string } = { kind: t.kind, p1, pair };
    const closes = genHistory(pair);
    const backtest = metrics(runTrades(spec, closes));
    const s: any = {
      id: `st-${idx++}`, name: `Minera ${t.kind.toUpperCase()} ${pair} ${t.tf} p${p1}`,
      pair, tf: t.tf, style: t.style, kind: t.kind, p1, status: "backtest",
      created_at: new Date().toISOString(), backtest,
    };
    if (backtest.trades < 10 || backtest.total <= 0 || backtest.sharpe < 0.2) {
      s.status = "descartada"; s.discard = "backtest bajo umbral (trades>10, total>0, sharpe>0.2)";
    } else {
      const rob = robustness(spec, closes, rnd);
      s.robustness = rob; s.status = "robustez";
      if (!rob.pass) { s.status = "descartada"; s.discard = `robustez ${rob.score}/4 insuficiente`; }
      else { s.status = "incubacion"; s.live = { equity: 100, pnl: 0, ticks: 0, peak: 100, dd: 0, pos: null }; }
    }
    await repo.saveStrategy(kv, s);
    out.push(s);
  }
  await repo.pushAudit(kv, { ts: new Date().toISOString(), ev: "incubator.mine", n: k });
  return json(out);
}
