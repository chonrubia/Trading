"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GET = GET;
const kv_js_1 = require("../../../lib/kv.js");
const state_js_1 = require("../../../lib/state.js");
const desks_js_1 = require("../../../lib/desks.js");
async function GET() {
    const kv = (0, kv_js_1.getKv)();
    await (0, state_js_1.ensureSeed)(kv, new Date().toISOString());
    const [market, openMap, closed] = await Promise.all([state_js_1.repo.market(kv), state_js_1.repo.openOps(kv), state_js_1.repo.closedOps(kv, 300)]);
    const open = Object.values(openMap);
    const venues = {};
    for (const [p, px] of Object.entries(market?.prices || {}))
        venues[p] = { a: px, b: px };
    return (0, kv_js_1.json)({
        venues: [], funding: market?.lastTick?.funding ?? 0.01,
        arbOpen: open.filter(o => o.desk === "arbitraje"),
        derivadosOpen: open.filter(o => o.desk === "derivados").length,
        hedge: open.find(o => o.desk === "cobertura") || null,
        signal: "-",
        pnl: (0, desks_js_1.deskPnl)([...closed, ...open]),
    });
}
