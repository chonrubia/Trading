// Mesas. Port de las funciones puras de backend/src/desks.js (F0 lo congela).
// venues/scanArb reciben eps y rng inyectados (antes: global + Math.random).
import type { Rng } from "./rng.js";
import { SPOT_TAKER, SLIP, HALF_SPREAD } from "./costs.js";

export interface Venue { a: number; b: number; eps?: number }

export function venues(prices: Record<string, number>, eps: Record<string, number>, rnd: Rng): { out: Record<string, Venue>; eps: Record<string, number> } {
  const out: Record<string, Venue> = {};
  const next: Record<string, number> = { ...eps };
  for (const [p, px] of Object.entries(prices)) {
    next[p] = Math.max(-0.004, Math.min(0.004, (next[p] || 0) + (rnd() - 0.5) * 0.0006));
    if (rnd() > 0.985) next[p] += (rnd() > 0.5 ? 1 : -1) * 0.002;
    out[p] = { a: px, b: Math.round(px * (1 + next[p]) * 10000) / 10000, eps: next[p] };
  }
  return { out, eps: next };
}

export function spreadOf(v: Venue): number {
  return Math.abs(v.a - v.b) / ((v.a + v.b) / 2) * 100;
}

export function arbCostPct(pair: string): number {
  return 4 * (SPOT_TAKER + SLIP + (HALF_SPREAD[pair] ?? 0.0004)) * 100;
}

export function scanArb(venMap: Record<string, Venue>, openArb: number, rnd: Rng): { pair: string; spreadOpen: number; buyAt: string } | null {
  if (openArb >= 3) return null;
  const cands = Object.entries(venMap)
    .map(([pair, v]) => ({ pair, v, sp: spreadOf(v), need: arbCostPct(pair) + 0.1 }))
    .filter(c => c.sp > c.need)
    .sort((a, b) => (b.sp - b.need) - (a.sp - a.need));
  if (!cands.length || rnd() > 0.6) return null;
  const c = cands[0];
  return { pair: c.pair, spreadOpen: Math.round(c.sp * 100) / 100, buyAt: c.v.a < c.v.b ? "A" : "B" };
}

export function arbPnl(spreadOpen: number, spreadNow: number, pair: string, notional = 150): { net: number; costs: number } {
  const gross = (spreadOpen - spreadNow) / 100 * notional;
  const rate = 4 * (SPOT_TAKER + SLIP + (HALF_SPREAD[pair] ?? 0.0004));
  const costEur = notional * rate;
  return { net: Math.round((gross - costEur) * 100) / 100, costs: Math.round(costEur * 100) / 100 };
}

export function hedgeSignal(exposure: number, drawdown: number): "open" | "close" | null {
  if (exposure > 80 || drawdown > 3) return "open";
  if (exposure < 50 && drawdown < 1.5) return "close";
  return null;
}

export function deskPnl(operations: Array<{ desk?: string; status: string; pnl?: number }>): Record<string, number> {
  const d: Record<string, number> = { spot: 0, arbitraje: 0, derivados: 0, cobertura: 0 };
  operations.forEach(o => {
    const k = o.desk || "spot";
    if (d[k] === undefined) d[k] = 0;
    d[k] += o.pnl || 0;
  });
  Object.keys(d).forEach(k => (d[k] = Math.round(d[k] * 100) / 100));
  return d;
}
