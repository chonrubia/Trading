"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GET = GET;
const kv_js_1 = require("../../../lib/kv.js");
const state_js_1 = require("../../../lib/state.js");
async function GET() {
    const kv = (0, kv_js_1.getKv)();
    await (0, state_js_1.ensureSeed)(kv, new Date().toISOString());
    const agents = Object.values(await state_js_1.repo.agents(kv));
    const sorted = agents.filter((a) => a.role === "Trader").sort((x, y) => y.pnl - x.pnl);
    const meta = await state_js_1.repo.meta(kv);
    return (0, kv_js_1.json)(sorted.slice(0, 50).map((a, i) => ({
        rank: i + 1, id: a.id, name: a.name, setup: a.strategy, pair: a.pair,
        pnl: a.pnl, hoy: a.pnl, win_rate: a.win_rate, suspended: meta.suspended.includes(a.id),
    })));
}
