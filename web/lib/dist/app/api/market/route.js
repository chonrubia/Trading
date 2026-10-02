"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GET = GET;
const kv_js_1 = require("../../../lib/kv.js");
const state_js_1 = require("../../../lib/state.js");
async function GET() {
    const kv = (0, kv_js_1.getKv)();
    await (0, state_js_1.ensureSeed)(kv, new Date().toISOString());
    const market = await state_js_1.repo.market(kv);
    return (0, kv_js_1.json)(market?.lastTick || { prices: {}, funding: 0, fear_greed: 50, risk_mode: "RISK-ON", ts: new Date().toISOString() });
}
