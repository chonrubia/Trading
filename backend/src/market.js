// Mercado simulado CON RÉGIMENES (Fase 8): alterna tramos de tendencia
// (autocorrelación explotable por setups de tendencia/breakout) y de rango
// (reversión a la media, para mean-reversion). Expone momentum por par.
// En real se sustituye por CCXT sin cambiar el formato del tick.
const BASE = { BTC: 67500, ETH: 3520, SOL: 172, XRP: 0.62, BNB: 595, DOGE: 0.16, ADA: 0.58, AVAX: 36.4, LINK: 18.2, NEAR: 7.8, TRX: 0.12, LTC: 84 };
const prices = { ...BASE };
const hist = {}; Object.keys(BASE).forEach(k => (hist[k] = [BASE[k]]));
// régimen global: dura 40-120 ticks, luego cambia (70% alterna)
let regime = "trend";
let regimeLeft = 60;
let trendDir = 1;

function momentum(pair, n = 12) {
  const h = hist[pair];
  if (h.length < n + 1) return 0;
  const a = h[h.length - 1 - n], b = h[h.length - 1];
  const chg = (b - a) / a;
  return Math.max(-1, Math.min(1, Math.round((chg / 0.02) * 100) / 100)); // ±2% -> ±1
}

function tick(rnd = Math.random) {
  regimeLeft--;
  if (regimeLeft <= 0) {
    regime = regime === "trend" && rnd() > 0.3 ? "range" : "trend";
    regimeLeft = 40 + Math.floor(rnd() * 80);
    trendDir = rnd() > 0.5 ? 1 : -1;
  }
  const out = {}, trend = {};
  for (const [k, v] of Object.entries(prices)) {
    let chg;
    if (regime === "trend") {
      chg = trendDir * (0.0008 + rnd() * 0.0012) + (rnd() - 0.5) * 0.0022; // deriva + ruido
    } else {
      const anchor = hist[k][0];
      const dev = (v - anchor) / anchor;
      chg = -dev * 0.06 + (rnd() - 0.5) * 0.0028; // reversión + ruido
      if (Math.abs(dev) > 0.08) hist[k][0] = v; // re-ancla si deriva mucho
    }
    prices[k] = Math.max(BASE[k] * 0.05, v * (1 + chg));
    hist[k].push(prices[k]);
    if (hist[k].length > 60) hist[k].shift();
    out[k] = Math.round(prices[k] * 10000) / 10000;
    trend[k] = momentum(k);
  }
  const strong = Object.values(trend).filter(t => Math.abs(t) > 0.4).length;
  return {
    ts: new Date().toISOString(),
    prices: out,
    funding: Math.round(rnd() * 0.05 * 10000) / 10000,
    fear_greed: regime === "trend" ? Math.floor(45 + rnd() * 40) : Math.floor(20 + rnd() * 40),
    risk_mode: regime === "trend" ? "RISK-ON" : strong > 4 ? "RISK-ON" : "RISK-OFF",
    regime, trend,
  };
}
function snapshot() {
  return { ts: new Date().toISOString(), prices: { ...prices }, funding: 0.01, fear_greed: 50, risk_mode: "RISK-ON", regime: "trend", trend: {} };
}

module.exports = { tick, snapshot };
