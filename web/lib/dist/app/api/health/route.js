"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GET = GET;
const kv_js_1 = require("../../../lib/kv.js");
const state_js_1 = require("../../../lib/state.js");
async function GET() {
    const kv = (0, kv_js_1.getKv)();
    await (0, state_js_1.ensureSeed)(kv, new Date().toISOString());
    const meta = await state_js_1.repo.meta(kv);
    return (0, kv_js_1.json)({ ok: true, agents: Object.keys(await state_js_1.repo.agents(kv)).length, mode: "paper", fase: "web", tickN: meta.tickN, ts: new Date().toISOString() });
}
