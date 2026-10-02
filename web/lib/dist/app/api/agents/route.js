"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GET = GET;
const kv_js_1 = require("../../../lib/kv.js");
const state_js_1 = require("../../../lib/state.js");
async function GET(req) {
    const kv = (0, kv_js_1.getKv)();
    await (0, state_js_1.ensureSeed)(kv, new Date().toISOString());
    const { searchParams } = new URL(req.url);
    const dept = searchParams.get("dept"), q = searchParams.get("q"), limit = Number(searchParams.get("limit")) || 200;
    let list = Object.values(await state_js_1.repo.agents(kv));
    if (dept)
        list = list.filter((a) => a.department_id === dept);
    if (q)
        list = list.filter((a) => `${a.name} ${a.strategy} ${a.pair}`.toLowerCase().includes(q.toLowerCase()));
    return (0, kv_js_1.json)(list.slice(0, limit));
}
