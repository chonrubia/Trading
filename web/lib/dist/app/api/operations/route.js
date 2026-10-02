"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GET = GET;
const kv_js_1 = require("../../../lib/kv.js");
const state_js_1 = require("../../../lib/state.js");
async function GET(req) {
    const kv = (0, kv_js_1.getKv)();
    await (0, state_js_1.ensureSeed)(kv, new Date().toISOString());
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status"), desk = searchParams.get("desk");
    const limit = Number(searchParams.get("limit")) || 50;
    const [closed, blocked, openMap] = await Promise.all([state_js_1.repo.closedOps(kv, 300), state_js_1.repo.blockedOps(kv, 100), state_js_1.repo.openOps(kv)]);
    let l = [...closed, ...blocked, ...Object.values(openMap)].reverse();
    if (status)
        l = l.filter(o => o.status === status);
    if (desk)
        l = l.filter(o => (o.desk || "spot") === desk);
    return (0, kv_js_1.json)(l.slice(0, limit));
}
