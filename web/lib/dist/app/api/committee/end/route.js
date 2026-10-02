"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.POST = POST;
const kv_js_1 = require("../../../../lib/kv.js");
const state_js_1 = require("../../../../lib/state.js");
const risk_js_1 = require("../../../../lib/risk.js");
async function POST() {
    const kv = (0, kv_js_1.getKv)();
    await (0, state_js_1.ensureSeed)(kv, new Date().toISOString());
    const [committee, meta, agentsMap, openMap] = await Promise.all([
        state_js_1.repo.committee(kv), state_js_1.repo.meta(kv), state_js_1.repo.agents(kv), state_js_1.repo.openOps(kv),
    ]);
    if (!committee?.active)
        return (0, kv_js_1.json)({ active: false });
    const traders = Object.values(agentsMap).filter((a) => a.role === "Trader").sort((a, b) => b.pnl - a.pnl);
    const top = traders.slice(0, 3);
    const summary = {
        id: `meet-${Date.now()}`,
        topic: committee.topic, ended_at: new Date().toISOString(), auto: false,
        patrimonio: Math.round(meta.equity), dayPnl: Math.round(meta.dayPnl * 100) / 100,
        exposure: (0, risk_js_1.fundExposure)(Object.values(openMap), meta.equity),
        top3: top.map((t) => ({ name: t.name, setup: t.strategy, pnl: Math.round(t.pnl * 100) / 100 })),
        decisions: [
            `Capital protegido: exposición ${(0, risk_js_1.fundExposure)(Object.values(openMap), meta.equity)}% dentro de límite`,
            top[0] ? `Refuerzo a ${top[0].name} (${top[0].strategy}) por liderar ranking` : "Sin datos de ranking",
            "Comité cerrado por el gestor: mantener operativa con prudencia",
        ],
        messages: (committee.log || []).length,
    };
    await state_js_1.repo.pushMeeting(kv, summary);
    await state_js_1.repo.saveCommittee(kv, { active: false, topic: "", started_at: null, ticks: 0, backup: {}, log: [] });
    const first = Object.values(agentsMap)[0];
    const msg = { id: `m-c-${Date.now()}`, channel_id: "c-general", from_agent_id: first.id, text: `Comité cerrado. Conclusiones: ${summary.decisions.join(" · ")}`, kind: "alerta", created_at: new Date().toISOString() };
    await state_js_1.repo.pushMsg(kv, msg);
    await state_js_1.repo.pushAudit(kv, { ts: new Date().toISOString(), ev: "committee.end", topic: summary.topic });
    return (0, kv_js_1.json)(summary);
}
