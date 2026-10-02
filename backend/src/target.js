// Objetivo diario y selectividad con expectancy en R-múltiplos.
// R = pnl / (nocional * SL 0.35% * leverage): compara setups con distinto tamaño.
// La memoria compartida vota: setups con lecciones ganadoras suben, con perdidas bajan.
const store = require("./store");
const memory = require("./memory");
const DAILY_TARGET = 50;
const MAX_TRADES_AGENT_DAY = 3;
const MIN_SAMPLE = 15; // muestra mínima para creer un avg
// tras batir el objetivo se sigue operando pero en modo proteger-ganancias
const RELAXED = { sizeMin: 8, sizeMax: 20, quality: 0.7, maxLev: 2 };
// tiers por calidad: riesgo acotado, más tamaño solo con edge probado
const TIERS = [
  { q: 0.8, n: 20, size: 35 },
  { q: 0.65, n: 8, size: 25 },
  { q: 0.55, n: 0, size: 12 },
];
function dayKey(d = new Date()) { return d.toISOString().slice(0, 10); }
function hits() { return store.load("target_days", {}); }
function recordDay(date, pnl, hit) {
  const h = hits(); h[date] = { pnl: Math.round(pnl * 100) / 100, hit };
  store.save("target_days", h);
}
function riskUnit(o) {
  const notional = (o.size || 0) * (o.entry || 0);
  return Math.max(0.01, notional * 0.0035 * (o.leverage || 1));
}
// expectancy por setup: {strategy, trades, net, avg, avgR, win}
function setupStats(closed) {
  const m = {};
  closed.forEach(o => {
    const k = o.strategy || o.agent_name || "desconocido";
    m[k] = m[k] || { strategy: k, trades: 0, net: 0, wins: 0, rSum: 0, notion: 0 };
    m[k].trades++; m[k].net += o.pnl || 0; if (o.pnl > 0) m[k].wins++;
    m[k].rSum += (o.pnl || 0) / riskUnit(o);
    m[k].notion += (o.size || 0) * (o.entry || 0);
  });
  return Object.values(m).map(s => ({
    strategy: s.strategy, trades: s.trades,
    net: Math.round(s.net * 100) / 100,
    avg: Math.round(s.net / s.trades * 100) / 100,
    avgR: Math.round(s.rSum / s.trades * 100) / 100,
    win: Math.round(s.wins / s.trades * 1000) / 10,
  })).sort((a, b) => b.avgR - a.avgR);
}
// expectancy por agente (para veto de perdedores y sizing)
function agentStats(closed) {
  const m = {};
  closed.forEach(o => {
    if (!o.agent_id) return;
    m[o.agent_id] = m[o.agent_id] || { trades: 0, wins: 0, net: 0 };
    m[o.agent_id].trades++; m[o.agent_id].net += o.pnl || 0; if (o.pnl > 0) m[o.agent_id].wins++;
  });
  return m;
}
function memoryBias(pair) {
  try {
    const list = memory.search(pair, 20);
    let g = 0, p = 0;
    list.forEach(e => {
      if (e.kind === "leccion-ganada") g++;
      else if (e.kind === "leccion-perdida") p++;
    });
    if (!g && !p) return 0;
    return Math.round(((g - p) / (g + p)) * 100) / 100;
  } catch { return 0; }
}
// tamaño por calidad (cap 35€ ≈ 7% del fondo)
function sizeFor(q, n) {
  for (const t of TIERS) if (q >= t.q && n >= t.n) return t.size;
  return 8; // exploración mínima
}
// puerta de calidad 0..1 con muestra significativa y veto a perdedores probados
function score(agent, st, tick, lastPnl, agWin, agTrades) {
  let s = 0.45;
  const n = st ? st.trades : 0;
  if (n >= MIN_SAMPLE && st.avgR > 0.05) s += 0.3;
  else if (n >= MIN_SAMPLE && st.avgR <= 0) s -= 0.5; // perdedor probado: fuera
  else if (n > 0 && n < MIN_SAMPLE) s += 0.02; // muestra corta: casi no cuenta
  // veto por agente: muchos trades y win rate malo -> a reentrenar
  if (agTrades >= 20 && agWin < 35) return 0.05;
  const trend = agent.style === "tendencia" || agent.style === "breakout";
  const mom = (tick.trend && tick.trend[agent.pair]) || 0;
  if (Math.abs(mom) > 0.35) {
    if ((mom > 0 && trend) || (mom < 0 && !trend)) s += 0.15;
    // mean-reversion a favor del momentum contrario ya va implícito
  } else if (tick.risk_mode === "RISK-ON" && trend) s += 0.1;
  else if (tick.risk_mode === "RISK-OFF" && !trend) s += 0.1;
  else s -= 0.1;
  s += memoryBias(agent.pair) * 0.15; // la memoria vota ±0.15
  if (lastPnl !== null && lastPnl < 0) s -= 0.15;
  return Math.max(0, Math.min(1, Math.round(s * 100) / 100));
}
module.exports = { DAILY_TARGET, MAX_TRADES_AGENT_DAY, MIN_SAMPLE, RELAXED, TIERS, dayKey, hits, recordDay, setupStats, agentStats, sizeFor, score, riskUnit };
