"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GET = GET;
const kv_js_1 = require("../../../lib/kv.js");
const state_js_1 = require("../../../lib/state.js");
async function GET(req) {
    const kv = (0, kv_js_1.getKv)();
    await (0, state_js_1.ensureSeed)(kv, new Date().toISOString());
    const { searchParams } = new URL(req.url);
    return (0, kv_js_1.json)(await state_js_1.repo.audit(kv, Number(searchParams.get("limit")) || 50));
}
