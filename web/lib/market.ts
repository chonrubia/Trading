// Mercado con regímenes. Port exacto de backend/src/market.js (el tick aleatorio
// original no se migra: sin régimen no hay edge que aprender).
// Todo el estado viaja en MarketState (KV); rnd inyectado.
import type { Rng } from "./rng.js";

export interface MarketState {
  prices: Record<string, number>;
  hist: Record<string, number[]>;
  regime: "trend" | "range";
  regimeLeft: number;
  trendDir: number;
}
export interface MarketTick {
  ts: string; prices: Record<string, number>; funding: number;
  fear_greed: number; risk_mode: string; regime: string; trend: Record<string, number>;
}
export const BASE_PRICES: Record<string, number> = {
  BTC: 67500, ETH: 3520, SOL: 172, XRP: 0.62, BNB: 595, DOGE: 0.16,
  ADA: 0.58, AVAX: 36.4, LINK: 18.2, NEAR: 7.8, TRX: 0.12, LTC: 84,
};

export function initMarket(): MarketState {
  const hist: Record<string, number[]> = {};
  Object.keys(BASE_PRICES).forEach(k => (hist[k] = [BASE_PRICES[k]]));
  return { prices: { ...BASE_PRICES }, hist, regime: "trend", regimeLeft: 60, trendDir: 1 };
}

export function momentum(hist: number[], n = 12): number {
  if (hist.length < n + 1) return 0;
  const chg = (hist[hist.length - 1] - hist[hist.length - 1 - n]) / hist[hist.length - 1 - n];
  return Math.max(-1, Math.min(1, Math.round((chg / 0.02) * 100) / 100));
}

export function tickMarket(s: MarketState, rnd: Rng, nowIso: string): { state: MarketState; tick: MarketTick } {
  let { regime, regimeLeft, trendDir } = s;
  regimeLeft--;
  if (regimeLeft <= 0) {
    regime = regime === "trend" && rnd() > 0.3 ? "range" : "trend";
    regimeLeft = 40 + Math.floor(rnd() * 80);
    trendDir = rnd() > 0.5 ? 1 : -1;
  }
  const prices = { ...s.prices };
  const hist: Record<string, number[]> = {};
  for (const k of Object.keys(prices)) hist[k] = [...(s.hist[k] || [prices[k]])];
  const out: Record<string, number> = {}, trend: Record<string, number> = {};
  for (const k of Object.keys(prices)) {
    const v = prices[k];
    let chg: number;
    if (regime === "trend") {
      chg = trendDir * (0.0008 + rnd() * 0.0012) + (rnd() - 0.5) * 0.0022;
    } else {
      const anchor = hist[k][0];
      const dev = (v - anchor) / anchor;
      chg = -dev * 0.06 + (rnd() - 0.5) * 0.0028;
      if (Math.abs(dev) > 0.08) hist[k][0] = v;
    }
    prices[k] = Math.max(BASE_PRICES[k] * 0.05, v * (1 + chg));
    hist[k].push(prices[k]);
    if (hist[k].length > 60) hist[k].shift();
    out[k] = Math.round(prices[k] * 10000) / 10000;
    trend[k] = momentum(hist[k]);
  }
  const strong = Object.values(trend).filter(t => Math.abs(t) > 0.4).length;
  return {
    state: { prices, hist, regime, regimeLeft, trendDir },
    tick: {
      ts: nowIso, prices: out,
      // Tasa de funding estilo Binance (por periodo de 8h, con signo: en real
      // los longs pagan cuando es positiva y COBRAN cuando es negativa).
      funding: Math.round((rnd() * 0.06 - 0.03) * 10000) / 10000,
      fear_greed: regime === "trend" ? Math.floor(45 + rnd() * 40) : Math.floor(20 + rnd() * 40),
      risk_mode: regime === "trend" ? "RISK-ON" : strong > 4 ? "RISK-ON" : "RISK-OFF",
      regime, trend,
    },
  };
}
