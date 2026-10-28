// Backtest OHLC sin lookahead: la señal se calcula al cierre de la vela i y
// SOLO puede ejecutarse en la apertura de i+1. Costes reales por lado.
import type { Candle } from "./binance.js";
import { buildSeries, signalAtSeries, stopsFor, specFor, normalizeTf, type StrategySpec, type StrategySeries } from "./strategies.js";
import { fillPrice } from "./accounting.js";
import { SPOT_TAKER } from "./costs.js";

export interface BacktestOptions {
  initial?: number;
  notional?: number;
  feeRate?: number;
  warmup?: number;
}

export interface BacktestTrade {
  entry_index: number; exit_index: number;
  entry_time: string; exit_time: string;
  entry_fill: number; exit_fill: number; qty: number;
  pnl: number; pnl_pct: number; fees: number;
  stop: number; target: number; reason: string; bars: number;
}

export interface BacktestResult {
  pair: string; tf: string; candles: number;
  trades: BacktestTrade[];
  n: number; net: number; net_pct: number;
  win_rate: number; profit_factor: number;
  max_drawdown: number; expectancy_r: number; sharpe: number;
  avg_trade: number; fees: number; exposure_pct: number;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const r4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;

function atrSeries(candles: Candle[], p = 14): number[] {
  const out = new Array(candles.length).fill(0);
  let sum = 0;
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i], prev = candles[i - 1];
    const tr = Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close));
    sum += tr;
    if (i > p) sum -= Math.max(candles[i - p].high - candles[i - p].low, Math.abs(candles[i - p].high - candles[i - p - 1].close), Math.abs(candles[i - p].low - candles[i - p - 1].close));
    out[i] = sum / Math.min(i, p);
  }
  return out;
}

export function runBacktest(spec: StrategySpec, candles: Candle[], opts: BacktestOptions = {}): BacktestResult {
  const initial = opts.initial ?? 60;
  const notional = opts.notional ?? 10;
  const feeRate = opts.feeRate ?? SPOT_TAKER;
  const n = candles.length;
  const empty: BacktestResult = {
    pair: spec.pair, tf: spec.tf, candles: n, trades: [], n: 0, net: 0, net_pct: 0,
    win_rate: 0, profit_factor: 0, max_drawdown: 0, expectancy_r: 0, sharpe: 0,
    avg_trade: 0, fees: 0, exposure_pct: 0,
  };
  if (n < 30) return empty;

  const series = buildSeries(spec, candles);
  const atrs = atrSeries(candles);
  const minWarm = Math.max(30, opts.warmup ?? 0, spec.p1 + 2, spec.p2 || 0);
  const trades: BacktestTrade[] = [];
  let pos: { entry_fill: number; qty: number; entry_fee: number; stop: number; target: number; entry_index: number; entry_time: string } | null = null;
  let pending: "ENTRY" | "EXIT" | null = null;
  let pendingReason = "";
  let lastExit = -2;
  let barsInMarket = 0;

  for (let i = minWarm; i < n; i++) {
    const bar = candles[i];
    // 1) ejecutar la decisión tomada al cierre de i-1 en la apertura de i
    if (pending === "ENTRY" && !pos && i > lastExit + 1 && i >= 1) {
      const fill = fillPrice(spec.pair, bar.open, "BUY");
      const qty = notional / fill;
      const st = stopsFor(fill, atrs[i - 1] || atrs[i] || 0);
      pos = {
        entry_fill: fill, qty, entry_fee: qty * fill * feeRate,
        stop: st.stop, target: st.target,
        entry_index: i, entry_time: new Date(bar.openTime).toISOString(),
      };
      pending = null;
    } else if (pending === "EXIT" && pos) {
      closeTrade(spec, trades, pos, bar.open, i, pendingReason || "señal", feeRate);
      lastExit = i; pos = null; pending = null;
    }

    // 2) stop/target dentro de la vela (stop primero: hipótesis conservadora)
    if (pos) {
      barsInMarket++;
      let exitPx: number | null = null, reason = "";
      if (bar.low <= pos.stop) { exitPx = Math.min(bar.open, pos.stop); reason = "SL"; }
      else if (bar.high >= pos.target) { exitPx = Math.max(bar.open, pos.target); reason = "TP"; }
      else if (i - pos.entry_index >= 96) { exitPx = bar.close; reason = "timeout"; }
      if (exitPx !== null) {
        closeTrade(spec, trades, pos, exitPx, i, reason, feeRate);
        lastExit = i; pos = null;
      }
    }

    // 3) señal al cierre de i -> se ejecutará en i+1 (nunca en esta vela)
    const sig = signalAtSeries(series, i);
    if (!pos && sig === "LONG") { pending = "ENTRY"; pendingReason = ""; }
    else if (pos && sig === "SHORT") { pending = "EXIT"; pendingReason = "señal SHORT"; }
    else pending = null;
  }
  // cierre final a la última apertura/cierre disponible (solo para reportar)
  if (pos && n > 0) closeTrade(spec, trades, pos, candles[n - 1].close, n - 1, "fin de datos", feeRate);

  return summarizeResult(spec, n, trades, initial, barsInMarket);
}

function closeTrade(spec: StrategySpec, out: BacktestTrade[], p: any, px: number, i: number, reason: string, feeRate: number) {
  const exitFill = fillPrice(spec.pair, px, "SELL");
  const gross = p.qty * exitFill;
  const exitFee = gross * feeRate;
  const pnl = gross - exitFee - p.qty * p.entry_fill - p.entry_fee;
  const risk = p.qty * Math.max(1e-9, p.entry_fill - p.stop);
  out.push({
    entry_index: p.entry_index, exit_index: i,
    entry_time: p.entry_time, exit_time: "",
    entry_fill: r4(p.entry_fill), exit_fill: r4(exitFill), qty: Math.round(p.qty * 1e8) / 1e8,
    pnl: r2(pnl), pnl_pct: r2((pnl / (p.qty * p.entry_fill)) * 100),
    fees: r2(p.entry_fee + exitFee), stop: r4(p.stop), target: r4(p.target),
    reason, bars: i - p.entry_index, expectancyR: pnl / risk,
  } as any);
}

function summarizeResult(spec: StrategySpec, n: number, trades: BacktestTrade[], initial: number, barsInMarket: number): BacktestResult {
  const pnls = trades.map(t => t.pnl);
  const net = r2(pnls.reduce((s, x) => s + x, 0));
  const wins = pnls.filter(x => x > 0);
  const losses = pnls.filter(x => x <= 0);
  const gp = wins.reduce((s, x) => s + x, 0);
  const gl = Math.abs(losses.reduce((s, x) => s + x, 0));
  let eq = initial, peak = initial, dd = 0;
  for (const p of pnls) { eq += p; peak = Math.max(peak, eq); dd = Math.max(dd, ((peak - eq) / peak) * 100); }
  const mean = pnls.length ? net / pnls.length : 0;
  const sd = pnls.length > 1 ? Math.sqrt(pnls.reduce((s, x) => s + (x - mean) ** 2, 0) / pnls.length) : 0;
  const expectancy = trades.length ? trades.reduce((s, t: any) => s + (t.expectancyR || 0), 0) / trades.length : 0;
  return {
    pair: spec.pair, tf: spec.tf, candles: n, trades,
    n: trades.length, net, net_pct: initial ? r2((net / initial) * 100) : 0,
    win_rate: trades.length ? r2((wins.length / trades.length) * 100) : 0,
    profit_factor: gl > 0 ? r2(gp / gl) : gp > 0 ? 99 : 0,
    max_drawdown: r2(dd), expectancy_r: r4(expectancy),
    sharpe: sd > 0 ? r2((mean / sd) * Math.sqrt(pnls.length)) : 0,
    avg_trade: trades.length ? r2(net / trades.length) : 0,
    fees: r2(trades.reduce((s, t) => s + t.fees, 0)),
    exposure_pct: n ? r2((barsInMarket / n) * 100) : 0,
  };
}

export interface FoldResult { fold: number; net: number; trades: number; win_rate: number; positive: boolean }
export interface WalkForward { folds: FoldResult[]; positive: number; total: number; pass: boolean }

export function walkForward(spec: StrategySpec, candles: Candle[], folds = 5, opts: BacktestOptions = {}): WalkForward {
  const size = Math.floor(candles.length / folds);
  const out: FoldResult[] = [];
  for (let k = 0; k < folds; k++) {
    const seg = candles.slice(k * size, k === folds - 1 ? candles.length : (k + 1) * size);
    const r = runBacktest(spec, seg, opts);
    out.push({ fold: k + 1, net: r.net, trades: r.n, win_rate: r.win_rate, positive: r.net > 0 });
  }
  const positive = out.filter(f => f.positive).length;
  return { folds: out, positive, total: folds, pass: positive >= 4 };
}

export interface MonteCarlo { runs: number; positive_pct: number; p05: number; p50: number; p95: number }

export function monteCarlo(trades: BacktestTrade[], runs = 500, seed = 42): MonteCarlo {
  const pnls = trades.map(t => t.pnl);
  if (!pnls.length) return { runs, positive_pct: 0, p05: 0, p50: 0, p95: 0 };
  let x = seed >>> 0;
  const rnd = () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; };
  const sums: number[] = [];
  for (let k = 0; k < runs; k++) {
    const sh = [...pnls];
    for (let i = sh.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [sh[i], sh[j]] = [sh[j], sh[i]]; }
    sums.push(sh.reduce((s, v) => s + v, 0));
  }
  sums.sort((a, b) => a - b);
  const q = (p: number) => r2(sums[Math.min(sums.length - 1, Math.max(0, Math.floor(p * sums.length)))]);
  return { runs, positive_pct: r2((sums.filter(s => s > 0).length / runs) * 100), p05: q(0.05), p50: q(0.5), p95: q(0.95) };
}

export interface StrategyValidation {
  name: string; pair: string; tf: string; kinds: string;
  candles: number; trades: number; net: number; win_rate: number;
  profit_factor: number; max_drawdown: number; expectancy_r: number; sharpe: number;
  oos_trades: number; oos_net: number; oos_pf: number; oos_dd: number;
  wf_positive: number; wf_total: number; mc_positive_pct: number;
  ready: boolean; checks: Record<string, boolean>;
  reason: string;
}

/** Veredicto honesto: OOS + walk-forward, nunca solo in-sample. */
export function validateStrategy(spec: StrategySpec, candles: Candle[], opts: BacktestOptions = {}): StrategyValidation {
  const full = runBacktest(spec, candles, opts);
  const cut = Math.floor(candles.length * 0.7);
  const oos = runBacktest(spec, candles.slice(cut), opts);
  const wf = walkForward(spec, candles, 5, opts);
  const mc = monteCarlo(full.trades);
  const checks = {
    oos_net_positive: oos.net > 0,
    oos_trades_30: oos.n >= 30,
    oos_pf_1_2: oos.profit_factor > 1.2,
    oos_dd_20: oos.max_drawdown < 20,
    walk_forward_4_5: wf.positive >= 4,
  };
  const ready = Object.values(checks).every(Boolean);
  const failed = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
  return {
    name: spec.name, pair: spec.pair, tf: spec.tf, kinds: spec.kind,
    candles: candles.length, trades: full.n, net: full.net, win_rate: full.win_rate,
    profit_factor: full.profit_factor, max_drawdown: full.max_drawdown,
    expectancy_r: full.expectancy_r, sharpe: full.sharpe,
    oos_trades: oos.n, oos_net: oos.net, oos_pf: oos.profit_factor, oos_dd: oos.max_drawdown,
    wf_positive: wf.positive, wf_total: wf.total, mc_positive_pct: mc.positive_pct,
    ready, checks, reason: ready ? "validada" : `no validada: ${failed.join(", ")}`,
  };
}

export function parseSpec(input: { name?: string; kind?: string; p1?: number; p2?: number; tf?: string; pair?: string; style?: string }): StrategySpec {
  if (input.name && specFor(input.name).name === input.name) return specFor(input.name);
  const kind = input.kind === "rsi" || input.kind === "donchian" || input.kind === "ema" ? input.kind : "ema";
  const p1 = Math.max(2, Math.min(200, Math.floor(Number(input.p1) || 14)));
  const p2 = input.p2 ? Math.max(3, Math.min(300, Math.floor(Number(input.p2)))) : undefined;
  return {
    name: input.name || `BT ${kind.toUpperCase()} ${input.pair || "BTC"}`,
    kind, p1, p2,
    tf: normalizeTf(String(input.tf || "1h")),
    pair: String(input.pair || "BTC"),
    style: input.style || "tendencia",
  };
}
