// Validación de la capa real: parseo Binance, contabilidad exacta, riesgos
// spot y backtest sin lookahead. Son los contratos que protegen el dinero.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseKlines, parseTicker, parseTickers, closedKlines, aggregate, staleness, INTERVAL_MS,
  type Candle,
} from "../binance.js";
import {
  newAccount, openPosition, closePosition, summarize, fillPrice, feeOf, round2,
} from "../accounting.js";
import { checkSpotOperation, SPOT_LIMITS } from "../risk.js";
import { runBacktest, validateStrategy } from "../backtest.js";
import type { StrategySpec } from "../strategies.js";
import { MemoryKv } from "../store.js";
import { ensureSeed, metaStale } from "../state.js";
import { liveReadiness } from "../validation.js";

const candle = (t: number, o: number, h: number, l: number, c: number, v = 1): Candle => ({
  openTime: t, open: o, high: h, low: l, close: c,
  volume: v, closeTime: t + INTERVAL_MS["15m"] - 1, trades: 1,
});

test("binance: parseo tolerante, velas cerradas y agregación OHLC", () => {
  const raw = [
    [0, "1", "2", "0.5", "1.5", "10", 899, "15", 3, "0", "0", "0"],
    ["corrupta"],
    [900, "1.5", "2.5", "1", "2", "5", 1799, "7.5", 2, "0", "0", "0"],
  ];
  const cs = parseKlines(raw);
  assert.equal(cs.length, 2);
  assert.equal(cs[0].close, 1.5);
  assert.equal(cs[1].trades, 2);
  assert.deepEqual(closedKlines(cs, 1500).map(c => c.openTime), [0]);
  assert.equal(closedKlines(cs, 1800).length, 2);

  const base = 0;
  const batch = [
    candle(base + 0 * INTERVAL_MS["15m"], 10, 12, 9, 11, 1),
    candle(base + 1 * INTERVAL_MS["15m"], 11, 13, 10, 12, 2),
    candle(base + 2 * INTERVAL_MS["15m"], 12, 14, 11, 13, 3),
    candle(base + 3 * INTERVAL_MS["15m"], 13, 15, 12, 14, 4),
    candle(base + 4 * INTERVAL_MS["15m"], 14, 16, 13, 15, 5),
  ];
  const h1 = aggregate(batch, 4);
  assert.equal(h1.length, 2);
  assert.equal(h1[0].open, 10);
  assert.equal(h1[0].high, 15);
  assert.equal(h1[0].low, 9);
  assert.equal(h1[0].close, 14);
  assert.equal(h1[0].volume, 10);
  assert.equal(h1[1].open, 14);
  assert.equal(h1[1].close, 15);
  assert.equal(aggregate(batch, 1).length, 5);
});

test("binance: tickers y frescura (stale a los 15 min)", () => {
  const now = 1_800_000_000_000;
  const t = parseTicker({
    symbol: "BTCEUR", lastPrice: "70000", priceChangePercent: "1.25",
    highPrice: "71000", lowPrice: "69000", quoteVolume: "1000000", closeTime: now - 1000,
  });
  assert.ok(t);
  assert.equal(t!.pair, "BTC");
  assert.equal(t!.price, 70000);
  const map = parseTickers([
    {
      symbol: "BTCEUR", lastPrice: "70000", priceChangePercent: "1.25",
      highPrice: "71000", lowPrice: "69000", quoteVolume: "1000000", closeTime: now - 1000,
    },
    { symbol: "NOPE", lastPrice: "1" },
  ]);
  assert.deepEqual(Object.keys(map), ["BTC"]);
  assert.equal(staleness(map, now).stale, false);
  assert.equal(staleness(map, now + 16 * 60_000).stale, true);
  assert.equal(staleness({}, now).stale, true);
});

test("contabilidad: costes reales y identidad equity = cash + posiciones", () => {
  const a0 = newAccount(60);
  const { account: a1, position } = openPosition(a0, {
    id: "op-1", agent_id: "a", agent_name: "A", strategy: "S", pair: "BTC",
    mid: 100, notional: 10, stop: 95, target: 110, maxLife: 10, opened_at: "t",
  });
  assert.equal(fillPrice("BTC", 100, "BUY"), 100.04);
  assert.equal(position.qty, 0.09996002);
  assert.equal(position.cost, 10);
  assert.equal(position.entry_fee, 0.01);
  assert.equal(a1.cash, 49.99);
  assert.equal(a1.feesPaid, 0.01);
  const s1 = summarize(a1, [position], { BTC: 100 });
  assert.equal(s1.equity, 59.99);
  assert.equal(s1.realized, 60);
  assert.equal(s1.unrealized, -0.01);
  assert.equal(s1.equity, round2(s1.cash + s1.positionsValue));

  const { account: a2, trade } = closePosition(a1, position, 110, "TP", "t2");
  assert.equal(fillPrice("BTC", 110, "SELL"), 109.956);
  assert.equal(trade.pnl, 0.97);
  assert.equal(trade.fees, 0.02);
  assert.equal(a2.cash, 60.97);
  assert.equal(a2.realized, 60.97);
  assert.equal(a2.feesPaid, 0.02);
  const s2 = summarize(a2, [], {});
  assert.equal(s2.equity, 60.97);
  assert.equal(s2.equity, a2.realized);
  assert.equal(s2.unrealized, 0);
  assert.equal(feeOf(10), 0.01);
});

test("riesgos spot: solo LONG, 1x, 3 posiciones, 5-10€ y frenos", () => {
  const base = {
    pair: "BTC", side: "LONG" as const, notional: 10, price: 70000, openCount: 0,
    cash: 60, dayPnl: 0, exposurePct: 0, drawdown: 0,
  };
  assert.equal(checkSpotOperation(base).approved, true);
  assert.equal(checkSpotOperation({ ...base, side: "SHORT" as any }).approved, false);
  assert.equal(checkSpotOperation({ ...base, openCount: 3 }).approved, false);
  assert.equal(checkSpotOperation({ ...base, notional: 4.99 }).approved, false);
  assert.equal(checkSpotOperation({ ...base, notional: 10.01 }).approved, false);
  assert.equal(checkSpotOperation({ ...base, dayPnl: -15 }).approved, false);
  assert.equal(checkSpotOperation({ ...base, drawdown: 30 }).approved, false);
  assert.equal(checkSpotOperation({ ...base, killSwitch: true }).approved, false);
  assert.equal(checkSpotOperation({ ...base, dayHalt: true }).approved, false);
  assert.equal(checkSpotOperation({ ...base, cash: 9 }).approved, false);
  assert.equal(SPOT_LIMITS.max_leverage, 1);
  assert.equal(SPOT_LIMITS.max_positions, 3);
  assert.equal(checkSpotOperation({ ...base, exposurePct: 55, notional: 10, cash: 40 }).approved, false);
});

function bars(n: number, drift: number): Candle[] {
  const out: Candle[] = [];
  let px = 100;
  for (let i = 0; i < n; i++) {
    const openTime = Date.UTC(2026, 0, 1) + i * INTERVAL_MS["1h"];
    const close = px * (1 + drift);
    out.push({
      openTime, open: px, high: Math.max(px, close) * 1.002, low: Math.min(px, close) * 0.998,
      close, volume: 1, closeTime: openTime + INTERVAL_MS["1h"] - 1, trades: 1,
    });
    px = close;
  }
  return out;
}
const spec: StrategySpec = { name: "bt", kind: "ema", p1: 5, p2: 10, tf: "1h", pair: "BTC", style: "tendencia" };

test("backtest: sin lookahead, entrada en la apertura siguiente y costes", () => {
  const cs = bars(300, 0.001);
  const r = runBacktest(spec, cs, { initial: 60, notional: 10 });
  assert.ok(r.trades.length > 0);
  for (const t of r.trades) {
    assert.ok(t.entry_index > 0);
    assert.ok(t.exit_index >= t.entry_index);
    assert.equal(t.entry_fill, Math.round(fillPrice("BTC", cs[t.entry_index].open, "BUY") * 10000) / 10000);
    assert.ok(t.fees > 0);
  }
  // En una caída monótona la EMA nunca da LONG: cero operaciones.
  const down = runBacktest(spec, bars(300, -0.001));
  assert.equal(down.trades.length, 0);
});

test("validación: OOS + walk-forward, y gate live cerrado al inicio", async () => {
  const cs = bars(600, 0.001);
  const v = validateStrategy(spec, cs);
  assert.equal(typeof v.ready, "boolean");
  assert.equal(v.checks.oos_net_positive, v.oos_net > 0);
  assert.equal(v.checks.oos_trades_30, v.oos_trades >= 30);
  assert.equal(v.checks.walk_forward_4_5, v.wf_positive >= 4);
  assert.deepEqual(Object.keys(v.checks).sort(), [
    "oos_dd_20", "oos_net_positive", "oos_pf_1_2", "oos_trades_30", "walk_forward_4_5",
  ]);
  const kv = new MemoryKv();
  await ensureSeed(kv, new Date().toISOString());
  const gate = await liveReadiness(kv);
  assert.equal(gate.ready_for_live, false);
  assert.ok(gate.failed.includes("days_28"));
  assert.ok(gate.failed.includes("scenarios_validated_3"));
  assert.equal(gate.live_enabled, false);
  assert.equal(gate.mode, "paper-real");
});

test("frescura: el cron muerto se detecta al leer, no solo al escribir", () => {
  const now = Date.now();
  assert.equal(metaStale({ stale: false, last_tick_at: new Date(now - 60_000).toISOString() }, now), false);
  assert.equal(metaStale({ stale: false, last_tick_at: new Date(now - 16 * 60_000).toISOString() }, now), true);
  assert.equal(metaStale({ stale: true, last_tick_at: new Date(now).toISOString() }, now), true);
  assert.equal(metaStale(null, now), true);
});
