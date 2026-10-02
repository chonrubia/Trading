// Costes realistas modo "dinero real" — replica Binance VIP0.
// Spot taker 0.10% / Futuros taker 0.05% por lado + slippage + medio spread por par.
// Sin distinción maker (se asume todo a mercado) y sin fees de ingreso/retirada.
const SPOT_TAKER = 0.001;
const FUT_TAKER = 0.0005;
const SLIP = 0.0003;
const HALF_SPREAD = {
  BTC: 0.0001, ETH: 0.0001, SOL: 0.0002, BNB: 0.0002,
  XRP: 0.0003, AVAX: 0.0003, LINK: 0.0003, TRX: 0.0003, LTC: 0.0002,
  ADA: 0.0004, DOGE: 0.0004, NEAR: 0.0005,
};
const spreadOf = (pair) => HALF_SPREAD[pair] ?? 0.0004;
// coste por lado según par y desk
function costPerSide(pair, desk) {
  const fee = desk === "derivados" ? FUT_TAKER : SPOT_TAKER;
  return fee + SLIP + spreadOf(pair);
}
// costes de cerrar: size*(entry+exit)*rate
function closeCosts(size, entry, exit, rate) {
  return Math.round(size * (entry + exit) * rate * 100) / 100;
}
// liquidación: devuelve {net, costs}
function settle(gross, size, entry, exit, rate) {
  const costs = closeCosts(size, entry, exit, rate);
  return { net: Math.round((gross - costs) * 100) / 100, costs };
}
// estimación al abrir (para transparencia)
function estOpen(size, entry, pair, desk) {
  const r = costPerSide(pair, desk === "derivados" ? "derivados" : "spot");
  return Math.round(size * entry * 2 * r * 100) / 100;
}
// round-trip orientativo en % para un par/desk
function roundtripPct(pair, desk) {
  return Math.round(costPerSide(pair, desk) * 2 * 10000) / 100;
}
module.exports = { SPOT_TAKER, FUT_TAKER, SLIP, HALF_SPREAD, costPerSide, closeCosts, settle, estOpen, roundtripPct };
