// Mercado real de Binance: snapshot por tick + series por par/timeframe.
// Sin fallback sintético: si falta un dato o está viejo, se lanza error y el
// motor no avanza (la UI muestra "SIN DATOS REALES").
import {
  PAIRS, SYMBOLS, PAIRS as ALL_PAIRS, type Pair, type Interval, type Candle, type Ticker,
  fetchTickers, fetchKlines, fetchFunding, fetchFearGreed, closedKlines, aggregate, staleness,
  type FetchImpl,
} from "./binance.js";

export const STALE_MS = 15 * 60_000;
export const LIVE_15M_LIMIT = 1000; // ~10 días de velas de 15m
export const LIVE_1D_LIMIT = 300;   // ~300 días

export type CandlesByPair = Record<string, Partial<Record<Interval, Candle[]>>>;

export interface RealMarket {
  source: "binance";
  ts: string;
  prices: Record<string, number>;
  change24h: Record<string, number>;
  high24h: Record<string, number>;
  low24h: Record<string, number>;
  quoteVolume24h: Record<string, number>;
  funding: number;
  fear_greed: number;
  risk_mode: "RISK-ON" | "RISK-OFF";
  regime: "trend" | "range";
  trend: Record<string, number>;
  candles: CandlesByPair;
  lastCandleTs: string;
  /** Edad del ticker más antiguo, en ms. */
  ageMs: number;
  stale: boolean;
}

export interface MarketInput {
  tickers: Record<string, Ticker>;
  klines15m: Record<string, Candle[]>;
  klines1d: Record<string, Candle[]>;
  funding: number;
  fearGreed: number;
  nowMs: number;
}

export function momentum(closes: number[], n = 12): number {
  if (closes.length < n + 1) return 0;
  const a = closes[closes.length - 1 - n], b = closes[closes.length - 1];
  if (!a) return 0;
  return Math.max(-1, Math.min(1, Math.round(((b - a) / a / 0.02) * 100) / 100));
}

function closesOf(candles: Candle[] | undefined): number[] {
  return (candles || []).map(c => c.close);
}

/** Construye el snapshot de forma pura (tests con fixtures, sin red). */
export function buildRealMarket(input: MarketInput): RealMarket {
  const nowMs = input.nowMs;
  const st = staleness(input.tickers, nowMs, STALE_MS);
  const prices: Record<string, number> = {}, change24h: Record<string, number> = {};
  const high24h: Record<string, number> = {}, low24h: Record<string, number> = {};
  const quoteVolume24h: Record<string, number> = {};
  const candles: CandlesByPair = {};
  let lastCandleMs = 0;

  for (const pair of ALL_PAIRS) {
    const t = input.tickers[pair];
    if (t) {
      prices[pair] = t.price;
      change24h[pair] = Math.round(t.changePct * 100) / 100;
      high24h[pair] = t.high; low24h[pair] = t.low;
      quoteVolume24h[pair] = Math.round(t.quoteVolume);
    }
    const m15 = closedKlines(input.klines15m[pair] || [], nowMs);
    const d1 = closedKlines(input.klines1d[pair] || [], nowMs);
    if (m15.length) lastCandleMs = Math.max(lastCandleMs, m15[m15.length - 1].closeTime);
    candles[pair] = {
      "15m": m15,
      "1h": aggregate(m15, 4),
      "4h": aggregate(m15, 16),
      "1d": d1,
    };
  }

  const trends: Record<string, number> = {};
  for (const pair of ALL_PAIRS) trends[pair] = momentum(closesOf(candles[pair]?.["1h"]), 12);
  const positive = Object.values(trends).filter(t => t > 0.15).length;
  const total = Object.values(trends).filter(t => t !== 0).length || 1;
  const breadth = positive / total;
  const strong = Object.values(trends).filter(t => Math.abs(t) > 0.4).length;

  return {
    source: "binance", ts: new Date(nowMs).toISOString(),
    prices, change24h, high24h, low24h, quoteVolume24h,
    funding: input.funding, fear_greed: input.fearGreed,
    risk_mode: breadth >= 0.5 ? "RISK-ON" : "RISK-OFF",
    regime: breadth >= 0.65 || breadth <= 0.35 || strong > 5 ? "trend" : "range",
    trend: trends, candles,
    lastCandleTs: lastCandleMs ? new Date(lastCandleMs).toISOString() : "",
    ageMs: st.ageMs, stale: st.stale,
  };
}

/** Descarga todo lo necesario para un tick. Paralelo y sin reintentos ocultos. */
export async function fetchRealMarket(f: FetchImpl = fetch, nowMs = Date.now()): Promise<RealMarket> {
  const [tickers, funding, fearGreed] = await Promise.all([
    fetchTickers(f), fetchFunding(f), fetchFearGreed(f),
  ]);
  const jobs: Array<Promise<void>> = [];
  const klines15m: Record<string, Candle[]> = {};
  const klines1d: Record<string, Candle[]> = {};
  for (const pair of PAIRS) {
    const sym = SYMBOLS[pair as Pair];
    jobs.push(fetchKlines(sym, "15m", LIVE_15M_LIMIT, f).then(x => { klines15m[pair] = x; }));
    jobs.push(fetchKlines(sym, "1d", LIVE_1D_LIMIT, f).then(x => { klines1d[pair] = x; }));
  }
  await Promise.all(jobs);
  return buildRealMarket({ tickers, klines15m, klines1d, funding, fearGreed, nowMs });
}

/** Series de un par/timeframe; [] si aún no hay histórico. */
export function candlesFor(m: RealMarket | null | undefined, pair: string, tf: string): Candle[] {
  const norm = tf === "1D" ? "1d" : tf === "5m" ? "15m" : tf;
  return (m?.candles?.[pair] as any)?.[norm] || [];
}

/** Resumen compacto que sí se persiste en KV (sin las 24k velas). */
export function marketSummary(m: RealMarket) {
  return {
    source: m.source, prices: m.prices, change24h: m.change24h,
    high24h: m.high24h, low24h: m.low24h, quoteVolume24h: m.quoteVolume24h,
    funding: m.funding, fear_greed: m.fear_greed, risk_mode: m.risk_mode,
    regime: m.regime, trend: m.trend, lastCandleTs: m.lastCandleTs,
    ageMs: m.ageMs, stale: m.stale, ts: m.ts,
    lastTick: {
      ts: m.ts, prices: m.prices, change24h: m.change24h,
      funding: m.funding, fear_greed: m.fear_greed, risk_mode: m.risk_mode,
      regime: m.regime, trend: m.trend, source: m.source, stale: m.stale,
      lastCandleTs: m.lastCandleTs,
    },
  };
}
