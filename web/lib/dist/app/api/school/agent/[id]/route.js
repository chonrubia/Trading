"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GET = GET;
const kv_js_1 = require("../../../../../lib/kv.js");
const state_js_1 = require("../../../../../lib/state.js");
async function GET(_, { params }) {
    const kv = (0, kv_js_1.getKv)();
    await (0, state_js_1.ensureSeed)(kv, new Date().toISOString());
    const all = await state_js_1.repo.learnings(kv, 300);
    return (0, kv_js_1.json)(all.filter((l) => l.agent_id === params.id).slice(0, 20));
}
