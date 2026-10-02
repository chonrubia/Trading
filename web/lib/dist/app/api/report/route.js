"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GET = GET;
const kv_js_1 = require("../../../lib/kv.js");
const state_js_1 = require("../../../lib/state.js");
const costs_js_1 = require("../../../lib/costs.js");
async function GET() {
    const kv = (0, kv_js_1.getKv)();
    await (0, state_js_1.ensureSeed)(kv, new Date().toISOString());
    const [closed, openMap, blocked, snapshots, days] = await Promise.all([
        state_js_1.repo.closedOps(kv, 300), state_js_1.repo.openOps(kv), state_js_1.repo.blockedOps(kv, 100),
        state_js_1.repo.snapshots(kv, 500), state_js_1.repo.targetDays(kv),
    ]);
    const open = Object.values(openMap);
    const net = closed.reduce((s, o) => s + (o.pnl || 0), 0);
    const fees = closed.reduce((s, o) => s + (o.fees || 0), 0);
    const wins = closed.filter((o) => o.pnl > 0);
    const gp = wins.reduce((s, o) => s + o.pnl, 0);
    const gl = Math.abs(closed.filter((o) => o.pnl <= 0).reduce((s, o) => s + o.pnl, 0));
    const reasons = {};
    blocked.forEach((o) => { const k = (o.risk_note || "?").slice(0, 60); reasons[k] = (reasons[k] || 0) + 1; });
    const deskNet = {};
    closed.forEach((o) => { const k = o.desk || "spot"; deskNet[k] = Math.round(((deskNet[k] || 0) + o.pnl) * 100) / 100; });
    const approved = closed.length + open.length;
    return (0, kv_js_1.json)({
        generated_at: new Date().toISOString(),
        costs_cfg: { spot_taker: costs_js_1.SPOT_TAKER, fut_taker: costs_js_1.FUT_TAKER, slip: costs_js_1.SLIP, nota: "todo taker a mercado" },
        trades: {
            closed: closed.length, open: open.length, blocked: blocked.length,
            block_rate: approved + blocked.length ? Math.round((blocked.length / (approved + blocked.length)) * 1000) / 10 + "%" : "0%",
        },
        net: Math.round(net * 100) / 100, fees_paid: Math.round(fees * 100) / 100,
        costs_drag: gp ? Math.round((fees / gp) * 1000) / 10 + "% de las ganancias brutas" : "-",
        win_rate: closed.length ? Math.round((wins.length / closed.length) * 1000) / 10 + "%" : "-",
        profit_factor: Math.round((gp / (gl || 1)) * 100) / 100, sharpe: 0,
        days: Object.keys(days).length, green_days: "-",
        desk_net: deskNet, block_reasons: reasons,
        audit_tail: (await state_js_1.repo.audit(kv, 5)).map((a) => a.ev),
        verdict: closed.length < 20 ? "muestra insuficiente (faltan trades)" : gp / (gl || 1) > 1.2 ? "consistente (provisional)" : "no consistente",
    });
}
