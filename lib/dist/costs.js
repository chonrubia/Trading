"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HALF_SPREAD = exports.SLIP = exports.FUT_TAKER = exports.SPOT_TAKER = void 0;
exports.costPerSide = costPerSide;
exports.closeCosts = closeCosts;
exports.settle = settle;
exports.estOpen = estOpen;
exports.roundtripPct = roundtripPct;
// Costes modo dinero-real. Port exacto de backend/src/costs.js (F0 lo congela).
exports.SPOT_TAKER = 0.001;
exports.FUT_TAKER = 0.0005;
exports.SLIP = 0.0003;
exports.HALF_SPREAD = {
    BTC: 0.0001, ETH: 0.0001, SOL: 0.0002, BNB: 0.0002,
    XRP: 0.0003, AVAX: 0.0003, LINK: 0.0003, TRX: 0.0003, LTC: 0.0002,
    ADA: 0.0004, DOGE: 0.0004, NEAR: 0.0005,
};
const spreadOf = (pair) => exports.HALF_SPREAD[pair] ?? 0.0004;
function costPerSide(pair, desk) {
    const fee = desk === "derivados" ? exports.FUT_TAKER : exports.SPOT_TAKER;
    return fee + exports.SLIP + spreadOf(pair);
}
function closeCosts(size, entry, exit, rate) {
    return Math.round(size * (entry + exit) * rate * 100) / 100;
}
function settle(gross, size, entry, exit, rate) {
    const costs = closeCosts(size, entry, exit, rate);
    return { net: Math.round((gross - costs) * 100) / 100, costs };
}
function estOpen(size, entry, pair, desk) {
    const r = costPerSide(pair, desk === "derivados" ? "derivados" : "spot");
    return Math.round(size * entry * 2 * r * 100) / 100;
}
function roundtripPct(pair, desk) {
    return Math.round(costPerSide(pair, desk) * 2 * 10000) / 100;
}
