"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GET = GET;
exports.POST = POST;
const kv_js_1 = require("../../../lib/kv.js");
const state_js_1 = require("../../../lib/state.js");
async function GET(req) {
    const kv = (0, kv_js_1.getKv)();
    await (0, state_js_1.ensureSeed)(kv, new Date().toISOString());
    const { searchParams } = new URL(req.url);
    return (0, kv_js_1.json)(await state_js_1.repo.memory(kv, searchParams.get("q") || "", Number(searchParams.get("limit")) || 30));
}
async function POST(req) {
    const { author = "Tú (humano)", dept = "direccion", pair = "BTC", text, kind = "nota" } = await (0, kv_js_1.body)(req);
    const kv = (0, kv_js_1.getKv)();
    await (0, state_js_1.ensureSeed)(kv, new Date().toISOString());
    if (!text)
        return (0, kv_js_1.json)({ error: "text requerido" }, 400);
    const e = { id: `mem-${Date.now()}`, ts: new Date().toISOString(), author, dept, pair, text, kind };
    await state_js_1.repo.pushMemory(kv, e);
    await state_js_1.repo.pushAudit(kv, { ts: new Date().toISOString(), ev: "memory.add", id: e.id });
    return (0, kv_js_1.json)(e);
}
