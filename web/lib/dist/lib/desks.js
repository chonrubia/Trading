"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.venues = venues;
exports.spreadOf = spreadOf;
exports.arbCostPct = arbCostPct;
exports.scanArb = scanArb;
exports.arbPnl = arbPnl;
exports.hedgeSignal = hedgeSignal;
exports.deskPnl = deskPnl;
const costs_js_1 = require("./costs.js");
function venues(prices, eps, rnd) {
    const out = {};
    const next = { ...eps };
    for (const [p, px] of Object.entries(prices)) {
        next[p] = Math.max(-0.004, Math.min(0.004, (next[p] || 0) + (rnd() - 0.5) * 0.0006));
        if (rnd() > 0.985)
            next[p] += (rnd() > 0.5 ? 1 : -1) * 0.002;
        out[p] = { a: px, b: Math.round(px * (1 + next[p]) * 10000) / 10000, eps: next[p] };
    }
    return { out, eps: next };
}
function spreadOf(v) {
    return Math.abs(v.a - v.b) / ((v.a + v.b) / 2) * 100;
}
function arbCostPct(pair) {
    return 4 * (costs_js_1.SPOT_TAKER + costs_js_1.SLIP + (costs_js_1.HALF_SPREAD[pair] ?? 0.0004)) * 100;
}
function scanArb(venMap, openArb, rnd) {
    if (openArb >= 3)
        return null;
    const cands = Object.entries(venMap)
        .map(([pair, v]) => ({ pair, v, sp: spreadOf(v), need: arbCostPct(pair) + 0.1 }))
        .filter(c => c.sp > c.need)
        .sort((a, b) => (b.sp - b.need) - (a.sp - a.need));
    if (!cands.length || rnd() > 0.6)
        return null;
    const c = cands[0];
    return { pair: c.pair, spreadOpen: Math.round(c.sp * 100) / 100, buyAt: c.v.a < c.v.b ? "A" : "B" };
}
function arbPnl(spreadOpen, spreadNow, pair, notional = 150) {
    const gross = (spreadOpen - spreadNow) / 100 * notional;
    const rate = 4 * (costs_js_1.SPOT_TAKER + costs_js_1.SLIP + (costs_js_1.HALF_SPREAD[pair] ?? 0.0004));
    const costEur = notional * rate;
    return { net: Math.round((gross - costEur) * 100) / 100, costs: Math.round(costEur * 100) / 100 };
}
function hedgeSignal(exposure, drawdown) {
    if (exposure > 80 || drawdown > 3)
        return "open";
    if (exposure < 50 && drawdown < 1.5)
        return "close";
    return null;
}
function deskPnl(operations) {
    const d = { spot: 0, arbitraje: 0, derivados: 0, cobertura: 0 };
    operations.forEach(o => {
        const k = o.desk || "spot";
        if (d[k] === undefined)
            d[k] = 0;
        d[k] += o.pnl || 0;
    });
    Object.keys(d).forEach(k => (d[k] = Math.round(d[k] * 100) / 100));
    return d;
}
