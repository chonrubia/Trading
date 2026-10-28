import { getKv, json, body } from "../../../lib/kv.js";
import { repo, ensureSeed } from "../../../lib/state.js";
import { PAIRS, SYMBOLS, fetchKlinesHistory, closedKlines, type Pair, type Interval } from "../../../lib/binance.js";
import { STRATEGIES, type StrategySpec } from "../../../lib/strategies.js";
import { validateStrategy, parseSpec } from "../../../lib/backtest.js";

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const revalidate = 0;
export const maxDuration = 60;

const HISTORY: Record<Interval, number> = { "15m": 6000, "1h": 3000, "4h": 2000, "1d": 1200 };

function specList(input: any): StrategySpec[] {
  if (input?.all) return STRATEGIES;
  if (input?.name) {
    const found = STRATEGIES.find(s => s.name === input.name);
    if (found) return [found];
  }
  return [parseSpec(input || {})];
}

export async function GET() {
  const kv = getKv();
  await ensureSeed(kv, new Date().toISOString());
  const all = await repo.strategies(kv);
  const rows = Object.values(all).map((s: any) => ({
    name: s.name, pair: s.pair, tf: s.tf, kind: s.kind, status: s.status,
    live: s.live || null, validation: s.validation || null, backtest: s.backtest || null,
  }));
  return json({
    source: "binance", generated_at: new Date().toISOString(),
    validated: rows.filter((r: any) => r.validation?.ready).length,
    total: rows.length, strategies: rows,
  });
}

export async function POST(req: Request) {
  const kv = getKv();
  await ensureSeed(kv, new Date().toISOString());
  const input = await body<any>(req);
  const specs = specList(input);
  if (specs.some(s => !PAIRS.includes(s.pair as Pair))) return json({ error: "par no soportado" }, 400);
  const requested = Number(input?.limit) || 0;
  const limit = requested ? Math.min(6000, Math.max(200, requested)) : 0;

  const results = await Promise.all(specs.map(async (spec) => {
    try {
      const want = limit || HISTORY[spec.tf];
      const raw = await fetchKlinesHistory(SYMBOLS[spec.pair as Pair], spec.tf, want);
      const candles = closedKlines(raw, Date.now());
      if (candles.length < 100) throw new Error(`histórico insuficiente (${candles.length} velas)`);
      const validation = validateStrategy(spec, candles);
      const row = {
        ...validation,
        candles: candles.length,
        first_candle: new Date(candles[0].openTime).toISOString(),
        last_candle: new Date(candles[candles.length - 1].closeTime).toISOString(),
        generated_at: new Date().toISOString(),
      };
      const existing = (await repo.strategies(kv))[spec.name] || {
        id: spec.name, name: spec.name, pair: spec.pair, tf: spec.tf,
        style: spec.style, kind: spec.kind, p1: spec.p1, p2: spec.p2,
      };
      await repo.saveStrategy(kv, {
        ...existing, status: existing.status === "activa" ? "activa" : existing.status,
        validation: row,
        backtest: { trades: row.trades, net: row.net, win: row.win_rate, pf: row.profit_factor, dd: row.max_drawdown, sharpe: row.sharpe },
      });
      await repo.pushAudit(kv, { ts: new Date().toISOString(), ev: "backtest.run", name: spec.name, ready: row.ready, oos_net: row.oos_net, trades: row.trades });
      return row;
    } catch (e: any) {
      return { name: spec.name, pair: spec.pair, tf: spec.tf, error: String(e?.message || e), ready: false, checks: {}, reason: "error de datos" };
    }
  }));

  const ok = results.filter((r: any) => !r.error);
  if (!ok.length) return json({ error: "Binance no devolvió histórico válido", detail: results }, 503);
  return json({
    source: "binance", generated_at: new Date().toISOString(),
    validated: ok.filter((r: any) => r.ready).length,
    total: results.length, results,
  });
}
