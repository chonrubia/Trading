"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GET = GET;
const kv_js_1 = require("../../../lib/kv.js");
const state_js_1 = require("../../../lib/state.js");
const risk_js_1 = require("../../../lib/risk.js");
async function GET() {
    const kv = (0, kv_js_1.getKv)();
    await (0, state_js_1.ensureSeed)(kv, new Date().toISOString());
    const [meta, openMap, closed, blocked] = await Promise.all([
        state_js_1.repo.meta(kv), state_js_1.repo.openOps(kv), state_js_1.repo.closedOps(kv, 300), state_js_1.repo.blockedOps(kv, 100),
    ]);
    const open = Object.values(openMap);
    return (0, kv_js_1.json)({
        limits: risk_js_1.FUND_LIMITS, kill: meta.kill,
        exposure: (0, risk_js_1.fundExposure)(open, meta.equity),
        dayPnl: Math.round(meta.dayPnl * 100) / 100, drawdown: meta.drawdown,
        open: open.length, blocked: blocked.length, suspended: meta.suspended,
    });
}
