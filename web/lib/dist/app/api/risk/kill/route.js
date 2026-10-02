"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.POST = POST;
const kv_js_1 = require("../../../../lib/kv.js");
const state_js_1 = require("../../../../lib/state.js");
async function POST(req) {
    const kv = (0, kv_js_1.getKv)();
    await (0, state_js_1.ensureSeed)(kv, new Date().toISOString());
    const { active } = await (0, kv_js_1.body)(req);
    const meta = await state_js_1.repo.meta(kv);
    meta.kill = !!active;
    await state_js_1.repo.saveMeta(kv, meta);
    const msg = { id: `m-kill-${Date.now()}`, channel_id: "c-general", from_agent_id: "a-002", text: active ? "Riesgos: KILL-SWITCH activado por humano. Trading detenido." : "Riesgos: kill-switch liberado. Reanudo paper.", kind: "alerta", created_at: new Date().toISOString() };
    await state_js_1.repo.pushMsg(kv, msg);
    await state_js_1.repo.pushAudit(kv, { ts: new Date().toISOString(), ev: "risk.kill", active: !!active });
    return (0, kv_js_1.json)({ kill: meta.kill });
}
