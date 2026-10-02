"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.POST = POST;
const kv_js_1 = require("../../../../../lib/kv.js");
const state_js_1 = require("../../../../../lib/state.js");
async function POST(_, { params }) {
    const kv = (0, kv_js_1.getKv)();
    await (0, state_js_1.ensureSeed)(kv, new Date().toISOString());
    const all = await state_js_1.repo.strategies(kv);
    const s = all[params.id];
    if (!s)
        return (0, kv_js_1.json)({ error: "not found" }, 404);
    s.status = "retirada";
    await state_js_1.repo.saveStrategy(kv, s);
    await state_js_1.repo.pushAudit(kv, { ts: new Date().toISOString(), ev: "incubator.retire", id: s.id });
    return (0, kv_js_1.json)(s);
}
