// Mercado simulado random-walk para BTC/ETH/SOL/... + funding + fear&greed.
// En Fase 3 se sustituye por CCXT sin cambiar el formato del tick.

const BASE = { BTC: 67500, ETH: 3520, SOL: 172, XRP: 0.62, BNB: 595, DOGE: 0.16, ADA: 0.58, AVAX: 36.4, LINK: 18.2, NEAR: 7.8, TRX: 0.12, LTC: 84 };
const prices = { ...BASE };

function tick(rnd = Math.random) {
  const out = {};
  for (const [k, v] of Object.entries(prices)) {
    const drift = (rnd() - 0.5) * 0.004;
    prices[k] = Math.max(v * 0.1, v * (1 + drift));
    out[k] = Math.round(prices[k] * 10000) / 10000;
  }
  return {
    ts: new Date().toISOString(),
    prices: out,
    funding: Math.round((rnd() * 0.05) * 10000) / 10000,
    fear_greed: Math.floor(20 + rnd() * 60),
    risk_mode: rnd() > 0.3 ? "RISK-ON" : "RISK-OFF",
  };
}
function snapshot() {
  return { ts: new Date().toISOString(), prices: { ...prices }, funding: 0.01, fear_greed: 50, risk_mode: "RISK-ON" };
}

module.exports = { tick, snapshot };
