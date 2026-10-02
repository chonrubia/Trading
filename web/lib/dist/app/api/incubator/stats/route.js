"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GET = GET;
const kv_js_1 = require("../../../../lib/kv.js");
const state_js_1 = require("../../../../lib/state.js");
async function GET() {
    const kv = (0, kv_js_1.getKv)();
    await (0, state_js_1.ensureSeed)(kv, new Date().toISOString());
    const all = Object.values(await state_js_1.repo.strategies(kv));
    const c = {};
    all.forEach(s => (c[s.status] = (c[s.status] || 0) + 1));
    return (0, kv_js_1.json)({ ...c, total: all.length, activas: c.activa || 0, incubacion: c.incubacion || 0, lista: c.lista || 0 });
}
