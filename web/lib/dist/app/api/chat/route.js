"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.POST = POST;
const kv_js_1 = require("../../../lib/kv.js");
const state_js_1 = require("../../../lib/state.js");
async function POST(req) {
    const kv = (0, kv_js_1.getKv)();
    await (0, state_js_1.ensureSeed)(kv, new Date().toISOString());
    const { channel_id = "c-general", text, to_agent_id = null } = await (0, kv_js_1.body)(req);
    if (!text)
        return (0, kv_js_1.json)({ error: "text requerido" }, 400);
    const meta = await state_js_1.repo.meta(kv);
    const msg = { id: `m-u-${Date.now()}`, channel_id, from_agent_id: null, to_agent_id, text, kind: "humano", created_at: new Date().toISOString() };
    await state_js_1.repo.pushMsg(kv, msg);
    const agentsMap = await state_js_1.repo.agents(kv);
    const list = Object.values(agentsMap);
    const target = list.find((a) => a.id === to_agent_id) || list[Math.floor(Math.random() * list.length)];
    const reply = { id: `m-${meta.msgN + 1}`, channel_id, from_agent_id: target.id, text: `Recibido. Lo reviso con ${target.strategy} en ${target.pair} (${target.timeframe}).`, kind: "respuesta", created_at: new Date().toISOString() };
    await state_js_1.repo.pushMsg(kv, reply);
    meta.msgN += 2;
    await state_js_1.repo.saveMeta(kv, meta);
    return (0, kv_js_1.json)({ ...msg, reply });
}
