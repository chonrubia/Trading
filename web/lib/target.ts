// Objetivo diario + puerta de calidad. Port de backend/src/target.js adaptado a
// serverless: memoryBias recibe entradas (no lee store) y el modo relaxed se decide fuera.
export const DAILY_TARGET = 50;
export const MAX_TRADES_AGENT_DAY = 3;
export const MIN_SAMPLE = 15;
export const RELAXED = { sizeMin: 8, sizeMax: 20, quality: 0.7, maxLev: 2 };
export const TIERS = [
  { q: 0.8, n: 20, size: 35 },
  { q: 0.65, n: 8, size: 25 },
  { q: 0.55, n: 0, size: 12 },
];

export function dayKey(d = new Date()): string { return d.toISOString().slice(0, 10); }

export function riskUnit(o: { size?: number; entry?: number; leverage?: number }): number {
  const notional = (o.size || 0) * (o.entry || 0);
  return Math.max(0.01, notional * 0.0035 * (o.leverage || 1));
}

export interface SetupStat { strategy: string; trades: number; net: number; avg: number; avgR: number; win: number }

export function setupStats(closed: any[]): SetupStat[] {
  const m: Record<string, any> = {};
  closed.forEach(o => {
    const k = o.strategy || o.agent_name || "desconocido";
    m[k] = m[k] || { strategy: k, trades: 0, net: 0, wins: 0, rSum: 0 };
    m[k].trades++; m[k].net += o.pnl || 0; if (o.pnl > 0) m[k].wins++;
    m[k].rSum += (o.pnl || 0) / riskUnit(o);
  });
  return Object.values(m).map((s: any) => ({
    strategy: s.strategy, trades: s.trades,
    net: Math.round(s.net * 100) / 100,
    avg: Math.round((s.net / s.trades) * 100) / 100,
    avgR: Math.round((s.rSum / s.trades) * 100) / 100,
    win: Math.round((s.wins / s.trades) * 1000) / 10,
  })).sort((a, b) => b.avgR - a.avgR);
}

export function agentStats(closed: any[]): Record<string, { trades: number; wins: number; net: number }> {
  const m: Record<string, { trades: number; wins: number; net: number }> = {};
  closed.forEach(o => {
    if (!o.agent_id) return;
    m[o.agent_id] = m[o.agent_id] || { trades: 0, wins: 0, net: 0 };
    m[o.agent_id].trades++; m[o.agent_id].net += o.pnl || 0; if (o.pnl > 0) m[o.agent_id].wins++;
  });
  return m;
}

// La memoria vota: +0.15 ponderado por balance de lecciones del par.
export function memoryBias(entries: Array<{ kind: string }>): number {
  let g = 0, p = 0;
  entries.forEach(e => {
    if (e.kind === "leccion-ganada") g++;
    else if (e.kind === "leccion-perdida") p++;
  });
  if (!g && !p) return 0;
  return Math.round(((g - p) / (g + p)) * 100) / 100;
}

export function sizeFor(q: number, n: number): number {
  for (const t of TIERS) if (q >= t.q && n >= t.n) return t.size;
  return 8;
}

export interface ScoreAgent { style: string; pair: string }
export interface ScoreTick { risk_mode: string; trend?: Record<string, number>; funding: number }

export function score(agent: ScoreAgent, st: SetupStat | undefined, tick: ScoreTick, lastPnl: number | null, agWin: number, agTrades: number, memBias: number): number {
  let s = 0.45;
  const n = st ? st.trades : 0;
  if (n >= MIN_SAMPLE && st!.avgR > 0.05) s += 0.3;
  else if (n >= MIN_SAMPLE && st!.avgR <= 0) s -= 0.5;
  else if (n > 0 && n < MIN_SAMPLE) s += 0.02;
  if (agTrades >= 20 && agWin < 35) return 0.05; // a reentrenar
  const trend = agent.style === "tendencia" || agent.style === "breakout";
  const mom = (tick.trend && tick.trend[agent.pair]) || 0;
  if (Math.abs(mom) > 0.35) {
    if ((mom > 0 && trend) || (mom < 0 && !trend)) s += 0.15;
  } else if (tick.risk_mode === "RISK-ON" && trend) s += 0.1;
  else if (tick.risk_mode === "RISK-OFF" && !trend) s += 0.1;
  else s -= 0.1;
  s += memBias * 0.15;
  if (lastPnl !== null && lastPnl < 0) s -= 0.15;
  return Math.max(0, Math.min(1, Math.round(s * 100) / 100));
}
