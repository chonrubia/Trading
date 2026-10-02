"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.POST = POST;
const kv_js_1 = require("../../../../lib/kv.js");
const state_js_1 = require("../../../../lib/state.js");
async function POST(req) {
    const kv = (0, kv_js_1.getKv)();
    await (0, state_js_1.ensureSeed)(kv, new Date().toISOString());
    const { agent_id, active } = await (0, kv_js_1.body)(req);
    const meta = await state_js_1.repo.meta(kv);
    const set = new Set(meta.suspended);
    if (active)
        set.add(agent_id);
    else
        set.delete(agent_id);
    meta.suspended = [...set];
    await state_js_1.repo.saveMeta(kv, meta);
    await state_js_1.repo.pushAudit(kv, { ts: new Date().toISOString(), ev: "risk.suspend", agent_id, active: !!active });
    return (0, kv_js_1.json)({ suspended: meta.suspended });
}
