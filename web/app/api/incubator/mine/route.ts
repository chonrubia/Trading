import { getKv, json, body } from "../../../../lib/kv.js";
import { repo, ensureSeed } from "../../../../lib/state.js";
import { PAIRS, SYMBOLS, fetchKlinesHistory, closedKlines, type Pair, type Interval } from "../../../../lib/binance.js";
import { validateStrategy } from "../../../../lib/backtest.js";
import { seedRand } from "../../../../lib/rng.js";
import type { StrategyKind } from "../../../../lib/strategies.js";

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const revalidate = 0;
export const maxDuration = 60;

const TEMPLATES: Array<{ style: string; tf: Interval; kind: StrategyKind }> = [
  { style: "tendencia", tf: "1h", kind: "ema" },
  { style: "mean reversion", tf: "15m", kind: "rsi" },
  { style: "breakout", tf: "4h", kind: "donchian" },
  { style: "swing", tf: "1d", kind: "ema" },
  { style: "scalping", tf: "15m", kind: "rsi" },
];
const HISTORY: Record<Interval, number> = { "15m": 6000, "1h": 3000, "4h": 2000, "1d": 1200 };

export async function POST(req: Request) {
  const kv = getKv();
  await ensureSeed(kv, new Date().toISOString());
  const { n = 3 } = await body<{ n?: number }>(req);
  const count = Math.min(10, Math.max(1, Number(n) || 3));
  const rnd = seedRand(Date.now() % 2147483647);
  const out: any[] = [];
  const existing = await repo.strategies(kv);
  let idx = Object.keys(existing).length + 1;

  for (let i = 0; i < count; i++) {
    const t = TEMPLATES[Math.floor(rnd() * TEMPLATES.length)];
    const pair = PAIRS[Math.floor(rnd() * PAIRS.length)];
    const p1 = t.kind === "ema" ? 8 + Math.floor(rnd() * 20)
      : t.kind === "rsi" ? 7 + Math.floor(rnd() * 14)
        : 15 + Math.floor(rnd() * 30);
    const spec = {
      name: `Minera ${t.kind.toUpperCase()} ${pair} ${t.tf} p${p1}`,
      kind: t.kind, p1, tf: t.tf, pair, style: t.style,
    };
    let row: any;
    try {
      const raw = await fetchKlinesHistory(SYMBOLS[pair as Pair], t.tf, HISTORY[t.tf]);
      const candles = closedKlines(raw, Date.now());
      if (candles.length < 100) throw new Error(`histórico insuficiente (${candles.length})`);
      const v = validateStrategy(spec as any, candles);
      row = {
        id: `st-${idx++}`, ...spec, status: v.ready ? "lista" : "descartada",
        discard: v.ready ? "" : v.reason,
        created_at: new Date().toISOString(), validation: v,
        backtest: { trades: v.trades, net: v.net, win: v.win_rate, pf: v.profit_factor, dd: v.max_drawdown, sharpe: 0 },
        candles: candles.length, source: "binance",
      };
    } catch (e: any) {
      row = {
        id: `st-${idx++}`, ...spec, status: "descartada",
        discard: `sin datos reales: ${String(e?.message || e)}`,
        created_at: new Date().toISOString(), source: "binance",
      };
    }
    await repo.saveStrategy(kv, row);
    out.push(row);
  }
  await repo.pushAudit(kv, { ts: new Date().toISOString(), ev: "incubator.mine", n: count });
  return json(out);
}
