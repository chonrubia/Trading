"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GET = GET;
const kv_js_1 = require("../../../lib/kv.js");
const state_js_1 = require("../../../lib/state.js");
const risk_js_1 = require("../../../lib/risk.js");
async function GET() {
    const kv = (0, kv_js_1.getKv)();
    await (0, state_js_1.ensureSeed)(kv, new Date().toISOString());
    const [meta, market, openMap, closed, blocked, msgs, committee, agentsMap] = await Promise.all([
        state_js_1.repo.meta(kv), state_js_1.repo.market(kv), state_js_1.repo.openOps(kv),
        state_js_1.repo.closedOps(kv, 300), state_js_1.repo.blockedOps(kv, 80),
        state_js_1.repo.messages(kv, "c-general", 20), state_js_1.repo.committee(kv), state_js_1.repo.agents(kv),
    ]);
    const open = Object.values(openMap);
    const names = {};
    Object.values(agentsMap).forEach((a) => (names[a.id] = a.name));
    return (0, kv_js_1.json)({
        tick: market?.lastTick || null,
        equity: meta.equity, dayPnl: meta.dayPnl, drawdown: meta.drawdown,
        exposure: (0, risk_js_1.fundExposure)(open, meta.equity),
        kill: meta.kill, committee: !!committee?.active,
        counts: { open: open.length, closed: closed.length, blocked: blocked.length, agents: Object.keys(agentsMap).length },
        msgs: msgs.map((m) => ({ ...m, from: names[m.from_agent_id] || "Tú" })),
        openOps: open.slice(-20),
    });
}
