"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GET = GET;
const kv_js_1 = require("../../../lib/kv.js");
const state_js_1 = require("../../../lib/state.js");
const risk_js_1 = require("../../../lib/risk.js");
async function GET() {
    const kv = (0, kv_js_1.getKv)();
    await (0, state_js_1.ensureSeed)(kv, new Date().toISOString());
    const [depts, agentsMap, meta, openMap] = await Promise.all([
        state_js_1.repo.departments(kv), state_js_1.repo.agents(kv), state_js_1.repo.meta(kv), state_js_1.repo.openOps(kv),
    ]);
    const counts = {};
    Object.values(agentsMap).forEach((a) => (counts[a.department_id] = (counts[a.department_id] || 0) + 1));
    const exp = (0, risk_js_1.fundExposure)(Object.values(openMap), meta.equity);
    return (0, kv_js_1.json)(depts.map((d) => ({
        ...d,
        headcount: counts[d.id] || 0,
        riesgos: {
            exposicion_bruta: `${exp}% / 150%`, exposicion_neta: `${exp}%`,
            caida_max: `${meta.drawdown}%`, resultado_dia: `${Math.round(meta.dayPnl)}€ (sin límite)`,
            estado: meta.kill ? "DETENIDO" : "Normal",
        },
    })));
}
