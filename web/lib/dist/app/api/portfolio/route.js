"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GET = GET;
const kv_js_1 = require("../../../lib/kv.js");
const state_js_1 = require("../../../lib/state.js");
const risk_js_1 = require("../../../lib/risk.js");
async function GET() {
    const kv = (0, kv_js_1.getKv)();
    await (0, state_js_1.ensureSeed)(kv, new Date().toISOString());
    const [meta, openMap, closed] = await Promise.all([state_js_1.repo.meta(kv), state_js_1.repo.openOps(kv), state_js_1.repo.closedOps(kv, 300)]);
    const open = Object.values(openMap);
    const costs = closed.reduce((s, o) => s + (o.fees || 0), 0);
    return (0, kv_js_1.json)({
        patrimonio: Math.round(meta.equity * 100) / 100,
        resultado_hoy: Math.round(meta.dayPnl * 100) / 100,
        caida: meta.drawdown,
        exposicion_bruta: (0, risk_js_1.fundExposure)(open, meta.equity),
        posiciones: open.length,
        costes_pagados: Math.round(costs * 100) / 100,
        objetivo: 50,
        progreso: Math.round((meta.dayPnl / 50) * 1000) / 10 + "%",
        freno_riesgos: false,
        mode: "PAPEL realista · sin dinero demo",
        kill: meta.kill,
    });
}
