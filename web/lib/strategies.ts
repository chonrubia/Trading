// Registro de estrategias del fondo y señales puras sobre velas reales.
// Las señales se calculan SOLO con velas cerradas; la ejecución va al precio
// actual del ticker (equivalente a la apertura siguiente en el backtest).
import type { Candle, Interval } from "./binance.js";
import { ema, rsi } from "./indicators.js";

export type StrategyKind = "ema" | "rsi" | "donchian";
export type Signal = "LONG" | "SHORT" | "FLAT";

export interface StrategySpec {
  name: string;
  kind: StrategyKind;
  p1: number;
  p2?: number;
  tf: Interval;
  pair: string;
  style: string;
}

/** Las 10 estrategias del seed, con parámetros explícitos y auditables. */
export const STRATEGIES: StrategySpec[] = [
  { name: "Setup_9376 · Tendencia BTC", kind: "ema", p1: 12, p2: 26, tf: "1h", pair: "BTC", style: "tendencia" },
  { name: "Setup_9373 · Breakout SOL", kind: "donchian", p1: 20, tf: "15m", pair: "SOL", style: "breakout" },
  { name: "Setup_9381 · MeanRev ETH", kind: "rsi", p1: 14, tf: "1h", pair: "ETH", style: "mean reversion" },
  { name: "Setup_9301 · Scalp ADA", kind: "rsi", p1: 7, tf: "15m", pair: "ADA", style: "scalping" },
  { name: "Setup_9292 · Swing AVAX", kind: "ema", p1: 21, p2: 55, tf: "4h", pair: "AVAX", style: "swing" },
  { name: "Setup_9250 · SMA 7-25 LONG", kind: "ema", p1: 7, p2: 25, tf: "1d", pair: "BTC", style: "tendencia" },
  { name: "Setup_9201 · RSI LINK", kind: "rsi", p1: 14, tf: "1h", pair: "LINK", style: "mean reversion" },
  { name: "Setup_9104 · Tendencia ETH 15m", kind: "ema", p1: 9, p2: 21, tf: "15m", pair: "ETH", style: "tendencia" },
  { name: "Setup_9007 · EMA DOGE", kind: "ema", p1: 9, p2: 21, tf: "1h", pair: "DOGE", style: "tendencia" },
  { name: "Setup_8902 · Donchian XRP", kind: "donchian", p1: 20, tf: "4h", pair: "XRP", style: "breakout" },
];

export const STRATEGY_BY_NAME: Record<string, StrategySpec> = Object.fromEntries(STRATEGIES.map(s => [s.name, s]));

export function specFor(name: string, pair?: string, tf?: string): StrategySpec {
  const found = STRATEGY_BY_NAME[name];
  if (found) return found;
  return { name, kind: "ema", p1: 12, p2: 26, tf: normalizeTf(tf || "1h"), pair: pair || "BTC", style: "tendencia" };
}

export function normalizeTf(tf: string): Interval {
  if (tf === "15m" || tf === "1h" || tf === "4h" || tf === "1d") return tf;
  if (tf === "5m") return "15m";
  if (tf === "1D" || tf === "1d") return "1d";
  if (tf === "4H") return "4h";
  if (tf === "1H") return "1h";
  return "1h";
}

export interface StrategySeries {
  spec: StrategySpec;
  closes: number[];
  fast: number[];
  slow: number[];
  rsi: number[];
  hi: number[];
  lo: number[];
  atr: number;
}

export function atr(candles: Candle[], p = 14): number {
  if (candles.length < 2) return 0;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i], prev = candles[i - 1];
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close)));
  }
  const slice = trs.slice(-p);
  return slice.reduce((s, x) => s + x, 0) / Math.max(1, slice.length);
}

/** Precalcula indicadores una vez por par/timeframe/tick (evita O(n²)). */
export function buildSeries(spec: StrategySpec, candles: Candle[]): StrategySeries {
  const closes = candles.map(c => c.close);
  const fast = spec.kind === "ema" ? ema(closes, spec.p1) : [];
  const slow = spec.kind === "ema" ? ema(closes, spec.p2 || spec.p1 * 3) : [];
  const r = spec.kind === "rsi" ? rsi(closes, spec.p1) : [];
  const hi = new Array(candles.length).fill(NaN);
  const lo = new Array(candles.length).fill(NaN);
  if (spec.kind === "donchian") {
    for (let i = spec.p1; i < candles.length; i++) {
      let h = -Infinity, l = Infinity;
      for (let j = i - spec.p1; j < i; j++) { h = Math.max(h, candles[j].high); l = Math.min(l, candles[j].low); }
      hi[i] = h; lo[i] = l;
    }
  }
  return { spec, closes, fast, slow, rsi: r, hi, lo, atr: atr(candles) };
}

export function signalAtSeries(s: StrategySeries, i = s.closes.length - 1): Signal {
  if (i < 1 || i >= s.closes.length) return "FLAT";
  const spec = s.spec;
  if (spec.kind === "ema") {
    if (i < Math.max(spec.p1, spec.p2 || spec.p1 * 3)) return "FLAT";
    return s.fast[i] > s.slow[i] ? "LONG" : s.fast[i] < s.slow[i] ? "SHORT" : "FLAT";
  }
  if (spec.kind === "rsi") {
    if (i < spec.p1) return "FLAT";
    return s.rsi[i] <= 35 ? "LONG" : s.rsi[i] >= 65 ? "SHORT" : "FLAT";
  }
  if (!Number.isFinite(s.hi[i]) || !Number.isFinite(s.lo[i])) return "FLAT";
  return s.closes[i] >= s.hi[i] ? "LONG" : s.closes[i] <= s.lo[i] ? "SHORT" : "FLAT";
}

export function signalAt(spec: StrategySpec, candles: Candle[], i = candles.length - 1): Signal {
  return signalAtSeries(buildSeries(spec, candles), i);
}

export function lastSignal(spec: StrategySpec, candles: Candle[]): Signal {
  if (candles.length < Math.max(2, spec.p1 + 1)) return "FLAT";
  return signalAt(spec, candles, candles.length - 1);
}

/** Vida máxima en ticks de 10 min según el timeframe de la señal. */
export function maxLifeFor(tf: Interval): number {
  return tf === "15m" ? 144 : tf === "1h" ? 288 : tf === "4h" ? 720 : 4320;
}

/** Stop/target ATR: acota el riesgo entre 0,6 % y 4 % por operación. */
export function stopsFor(entry: number, atrValue: number, direction: 1 | -1 = 1): { stop: number; target: number } {
  const atrPct = entry > 0 ? atrValue / entry : 0;
  const stopPct = Math.max(0.006, Math.min(0.04, atrPct * 1.5 || 0.012));
  const targetPct = Math.max(0.012, Math.min(0.08, stopPct * 2));
  return {
    stop: entry * (1 - stopPct * direction),
    target: entry * (1 + targetPct * direction),
  };
}
