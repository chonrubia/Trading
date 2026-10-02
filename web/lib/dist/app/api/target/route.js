"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GET = GET;
const kv_js_1 = require("../../../lib/kv.js");
const state_js_1 = require("../../../lib/state.js");
async function GET() {
    const kv = (0, kv_js_1.getKv)();
    await (0, state_js_1.ensureSeed)(kv, new Date().toISOString());
    const [meta, days] = await Promise.all([state_js_1.repo.meta(kv), state_js_1.repo.targetDays(kv)]);
    const hist = Object.entries(days).map(([day, v]) => ({ day, ...v })).sort((a, b) => (a.day < b.day ? 1 : -1)).slice(0, 14);
    return (0, kv_js_1.json)({
        target: 50, today: meta.today, dayPnl: Math.round(meta.dayPnl * 100) / 100,
        progress: Math.round((meta.dayPnl / 50) * 1000) / 10 + "%",
        hit: meta.dayPnl >= 50, history: hist, hits: hist.filter(d => d.hit).length,
    });
}
