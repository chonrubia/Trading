"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.POST = POST;
const kv_js_1 = require("../../../../lib/kv.js");
const store_js_1 = require("../../../../lib/store.js");
const state_js_1 = require("../../../../lib/state.js");
const risk_js_1 = require("../../../../lib/risk.js");
const costs_js_1 = require("../../../../lib/costs.js");
async function POST(req) {
    const kv = (0, kv_js_1.getKv)();
    await (0, state_js_1.ensureSeed)(kv, new Date().toISOString());
    const { agent_id, pair, side = "LONG", size, leverage } = await (0, kv_js_1.body)(req);
    const [agentsMap, meta, market, openMap] = await Promise.all([
        state_js_1.repo.agents(kv), state_js_1.repo.meta(kv), state_js_1.repo.market(kv), state_js_1.repo.openOps(kv),
    ]);
    const traders = Object.values(agentsMap).filter((a) => a.role === "Trader");
    const agent = agentsMap[agent_id] || traders[0];
    if (!agent)
        return (0, kv_js_1.json)({ error: "sin agentes" }, 400);
    const px = market?.prices?.[pair || agent.pair] ?? 100;
    const useSize = size || Math.round((20 / px) * 10000) / 10000;
    const prop = { pair: pair || agent.pair, side, entry: px, size: useSize, leverage: leverage || agent.leverage };
    const open = Object.values(openMap);
    const verdict = (0, risk_js_1.checkOperation)({ id: agent.id, name: agent.name, leverage: agent.leverage, pnl: agent.pnl }, prop, { equity: meta.equity, killSwitch: meta.kill, suspended: meta.suspended, openOps: open });
    const rate = (0, costs_js_1.costPerSide)(prop.pair, "spot");
    const res = await (0, store_js_1.withLock)(kv, "lock:propose", 5000, async () => {
        const m = await state_js_1.repo.meta(kv);
        const op = {
            id: `op-${m.opN}`, agent_id: agent.id, agent_name: agent.name, strategy: agent.strategy, ...prop,
            size: verdict.size || prop.size, leverage: verdict.leverage || prop.leverage,
            status: verdict.approved ? "abierta" : "bloqueada", pnl: 0, life: 0,
            maxLife: 40 + Math.floor(Math.random() * 40), risk_note: verdict.reason,
            estCosts: Math.round(useSize * px * 2 * rate * 100) / 100,
            opened_at: new Date().toISOString(),
        };
        m.opN += 1;
        await state_js_1.repo.saveMeta(kv, m);
        if (verdict.approved)
            await state_js_1.repo.saveOpenOp(kv, op);
        else
            await state_js_1.repo.pushBlocked(kv, op);
        await state_js_1.repo.pushAudit(kv, { ts: new Date().toISOString(), ev: "op.propose", id: op.id, agent: agent.id, status: op.status });
        return op;
    });
    if (res.locked)
        return (0, kv_js_1.json)({ error: "operación en curso, reintenta" }, 429);
    void risk_js_1.fundExposure;
    return (0, kv_js_1.json)(res.result);
}
