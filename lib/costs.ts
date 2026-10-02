// Costes modo dinero-real. Port exacto de backend/src/costs.js (F0 lo congela).
export const SPOT_TAKER = 0.001;
export const FUT_TAKER = 0.0005;
export const SLIP = 0.0003;
export const HALF_SPREAD: Record<string, number> = {
  BTC: 0.0001, ETH: 0.0001, SOL: 0.0002, BNB: 0.0002,
  XRP: 0.0003, AVAX: 0.0003, LINK: 0.0003, TRX: 0.0003, LTC: 0.0002,
  ADA: 0.0004, DOGE: 0.0004, NEAR: 0.0005,
};
const spreadOf = (pair: string): number => HALF_SPREAD[pair] ?? 0.0004;

export type Desk = "spot" | "derivados" | "arbitraje" | "cobertura";

export function costPerSide(pair: string, desk: string): number {
  const fee = desk === "derivados" ? FUT_TAKER : SPOT_TAKER;
  return fee + SLIP + spreadOf(pair);
}

export function closeCosts(size: number, entry: number, exit: number, rate: number): number {
  return Math.round(size * (entry + exit) * rate * 100) / 100;
}

export function settle(gross: number, size: number, entry: number, exit: number, rate: number): { net: number; costs: number } {
  const costs = closeCosts(size, entry, exit, rate);
  return { net: Math.round((gross - costs) * 100) / 100, costs };
}

export function estOpen(size: number, entry: number, pair: string, desk: string): number {
  const r = costPerSide(pair, desk === "derivados" ? "derivados" : "spot");
  return Math.round(size * entry * 2 * r * 100) / 100;
}

export function roundtripPct(pair: string, desk: string): number {
  return Math.round(costPerSide(pair, desk) * 2 * 10000) / 100;
}
