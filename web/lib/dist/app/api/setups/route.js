"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GET = GET;
const kv_js_1 = require("../../../lib/kv.js");
const state_js_1 = require("../../../lib/state.js");
const stats_js_1 = require("../../../lib/stats.js");
async function GET() {
    const kv = (0, kv_js_1.getKv)();
    await (0, state_js_1.ensureSeed)(kv, new Date().toISOString());
    return (0, kv_js_1.json)((0, stats_js_1.setupStats)(await state_js_1.repo.closedOps(kv, 300)).slice(0, 20));
}
