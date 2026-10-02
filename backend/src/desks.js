// Mesas Fase 7: arbitraje dual-venue, derivados con funding, coberturas de cartera.
// Todo paper. Funciones puras; index.js orquesta y persiste en operations con campo desk.
const costs = require("./costs");
const eps = {}; // offset venueB por pair (random walk acotado)

function venues(prices) {
  const out = {};
  for (const [p, px] of Object.entries(prices)) {
    eps[p] = Math.max(-0.004, Math.min(0.004, (eps[p] || 0) + (Math.random() - 0.5) * 0.0006));
    // shock ocasional de spread (descorrelación puntual entre venues)
    if (Math.random() > 0.985) eps[p] += (Math.random() > 0.5 ? 1 : -1) * 0.002;
    out[p] = { a: px, b: Math.round(px * (1 + eps[p]) * 10000) / 10000, eps: eps[p] };
  }
  return out;
}
function spreadOf(v) { return Math.abs(v.a - v.b) / ((v.a + v.b) / 2) * 100; }

// Propuesta de arbitraje solo si el spread cubre costes (4 patas taker) + margen.
// Como en real: oportunidades escasas; el umbral lo marca el par, no un fijo.
function arbCostPct(pair) {
  return 4 * (costs.SPOT_TAKER + costs.SLIP + (costs.HALF_SPREAD[pair] ?? 0.0004)) * 100;
}
function scanArb(venMap, openArb) {
  if (openArb >= 3) return null;
  const cands = Object.entries(venMap)
    .map(([pair, v]) => ({ pair, v, sp: spreadOf(v), need: arbCostPct(pair) + 0.1 }))
    .filter(c => c.sp > c.need)
    .sort((a, b) => (b.sp - b.need) - (a.sp - a.need));
  if (!cands.length || Math.random() > 0.6) return null;
  const c = cands[0];
  return { pair: c.pair, spreadOpen: Math.round(c.sp * 100) / 100, buyAt: c.v.a < c.v.b ? "A" : "B" };
}
// PnL paper de arb: captura de spread sobre nocional menos 4 patas taker
function arbPnl(spreadOpen, spreadNow, pair, notional = 150) {
  const gross = (spreadOpen - spreadNow) / 100 * notional;
  const rate = 4 * (costs.SPOT_TAKER + costs.SLIP + (costs.HALF_SPREAD[pair] ?? 0.0004));
  const costEur = notional * rate;
  return { net: Math.round((gross - costEur) * 100) / 100, costs: Math.round(costEur * 100) / 100 };
}
// Cobertura: abrir si riesgo alto, cerrar si normaliza
function hedgeSignal(exposure, drawdown) {
  if (exposure > 80 || drawdown > 3) return "open";
  if (exposure < 50 && drawdown < 1.5) return "close";
  return null;
}
function deskPnl(operations) {
  const d = { spot: 0, arbitraje: 0, derivados: 0, cobertura: 0 };
  operations.forEach(o => {
    const k = o.desk || "spot";
    if (d[k] === undefined) d[k] = 0;
    d[k] += o.status === "abierta" ? (o.pnl || 0) : (o.pnl || 0);
  });
  Object.keys(d).forEach(k => d[k] = Math.round(d[k] * 100) / 100);
  return d;
}
module.exports = { venues, spreadOf, scanArb, arbPnl, arbCostPct, hedgeSignal, deskPnl };
