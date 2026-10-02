"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.POST = POST;
const kv_js_1 = require("../../../../../lib/kv.js");
const state_js_1 = require("../../../../../lib/state.js");
async function POST(_, { params }) {
    const kv = (0, kv_js_1.getKv)();
    await (0, state_js_1.ensureSeed)(kv, new Date().toISOString());
    const all = await state_js_1.repo.strategies(kv);
    const s = all[params.id];
    if (!s || s.status !== "lista")
        return (0, kv_js_1.json)({ error: "no está lista (requiere status=lista)" }, 400);
    const agentsMap = await state_js_1.repo.agents(kv);
    const ids = Object.keys(agentsMap);
    const aid = `a-${String(ids.length + 1).padStart(3, "0")}`;
    const trading = Object.values(agentsMap).find((a) => a.department_id === "d-trading");
    const agent = {
        id: aid, name: `Incubada ${s.pair} ${s.style} #${s.id}`, role: "Trader",
        department_id: trading?.department_id || "d-trading",
        avatar_seed: 1000 + ids.length, strategy: s.name, pair: s.pair,
        timeframe: s.tf, style: s.style, risk_level: 2, leverage: 2, capital_assigned: 25,
        status: "analizando", mood: "enfocado", incubated: true, level_risk: 2, level_ta: 2,
        studying: "Gestión de riesgo", pnl: 0, win_rate: s.backtest?.win ?? 50,
        profit_factor: s.backtest?.pf ?? 1, drawdown: 0, trades_count: 0,
        x: 0.45, y: 0.55, last_reason: `Incubada de ${s.name}: supera incubación y recibe 25€.`,
    };
    await state_js_1.repo.saveAgent(kv, agent);
    s.status = "activa";
    s.agent_id = aid;
    s.activated_at = new Date().toISOString();
    await state_js_1.repo.saveStrategy(kv, s);
    await state_js_1.repo.pushMemory(kv, { id: `mem-${Date.now()}`, ts: new Date().toISOString(), author: "Laboratorio", dept: "lab", pair: s.pair, text: `${s.name} supera incubación y recibe 25€ de capital.`, kind: "incubacion" });
    await state_js_1.repo.pushAudit(kv, { ts: new Date().toISOString(), ev: "incubator.promote", id: s.id, agent: aid });
    return (0, kv_js_1.json)(s);
}
