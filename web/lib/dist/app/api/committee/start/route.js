"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.POST = POST;
const kv_js_1 = require("../../../../lib/kv.js");
const store_js_1 = require("../../../../lib/store.js");
const state_js_1 = require("../../../../lib/state.js");
async function POST(req) {
    const kv = (0, kv_js_1.getKv)();
    await (0, state_js_1.ensureSeed)(kv, new Date().toISOString());
    const { topic } = await (0, kv_js_1.body)(req);
    const res = await (0, store_js_1.withLock)(kv, "lock:committee", 5000, async () => {
        const committee = await state_js_1.repo.committee(kv);
        if (committee?.active)
            return { active: true };
        const agentsMap = await state_js_1.repo.agents(kv);
        const first = Object.values(agentsMap)[0];
        const next = {
            active: true, ticks: 0, log: [],
            topic: topic || "Reunión de comité: revisión de riesgos y ranking",
            started_at: new Date().toISOString(),
            backup: {},
        };
        await state_js_1.repo.saveCommittee(kv, next);
        const msg = { id: `m-c-${Date.now()}`, channel_id: "c-general", from_agent_id: first.id, text: `Comité convocado: ${next.topic}. Toda la oficina a la sala.`, kind: "alerta", created_at: new Date().toISOString() };
        await state_js_1.repo.pushMsg(kv, msg);
        await state_js_1.repo.pushAudit(kv, { ts: new Date().toISOString(), ev: "committee.start", topic: next.topic });
        return { active: true, topic: next.topic };
    });
    if (res.locked)
        return (0, kv_js_1.json)({ error: "comité en curso, reintenta" }, 429);
    return (0, kv_js_1.json)(res.result);
}
