// Objetivo diario y selectividad — el fondo deja de operar por operar.
// DAILY_TARGET aspiracional; la máquina optimiza expectancy y protege lo ganado.
const store = require("./store");
const DAILY_TARGET = 50;
const MAX_TRADES_AGENT_DAY = 3;
// tras batir el objetivo se sigue operando pero en modo proteger-ganancias
const RELAXED = { sizeMin: 8, sizeMax: 20, quality: 0.7, maxLev: 2 };

function dayKey(d = new Date()) { return d.toISOString().slice(0, 10); }
function hits() { return store.load("target_days", {}); }
function recordDay(date, pnl, hit) {
  const h = hits(); h[date] = { pnl: Math.round(pnl * 100) / 100, hit };
  store.save("target_days", h);
}
// expectancy por setup desde cerradas: {strategy: {trades, net, avg, win}}
function setupStats(closed) {
  const m = {};
  closed.forEach(o => {
    const k = o.strategy || o.agent_name || "desconocido";
    m[k] = m[k] || { strategy: k, trades: 0, net: 0, wins: 0 };
    m[k].trades++; m[k].net += o.pnl || 0; if (o.pnl > 0) m[k].wins++;
  });
  return Object.values(m).map(s => ({
    ...s, net: Math.round(s.net * 100) / 100,
    avg: Math.round(s.net / s.trades * 100) / 100,
    win: Math.round(s.wins / s.trades * 1000) / 10,
  })).sort((a, b) => b.avg - a.avg);
}
// puerta de calidad 0..1: expectancy del setup + régimen + estado del agente
function score(agent, setupAvg, setupTrades, tick, lastPnl) {
  let s = 0.45;
  if (setupTrades >= 5 && setupAvg > 0) s += 0.3;
  else if (setupTrades >= 5 && setupAvg < -1) s -= 0.45;
  else s += 0.05; // setups sin muestra: explorar con prudencia
  const trend = agent.style === "tendencia" || agent.style === "breakout";
  if (tick.risk_mode === "RISK-ON" && trend) s += 0.15;
  else if (tick.risk_mode === "RISK-OFF" && !trend) s += 0.15;
  else s -= 0.1;
  if (lastPnl !== null && lastPnl < 0) s -= 0.2; // enfriar tras pérdida (anti-tilt)
  return Math.max(0, Math.min(1, Math.round(s * 100) / 100));
}
module.exports = { DAILY_TARGET, MAX_TRADES_AGENT_DAY, RELAXED, dayKey, hits, recordDay, setupStats, score };
