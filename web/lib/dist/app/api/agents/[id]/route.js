"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GET = GET;
const kv_js_1 = require("../../../../lib/kv.js");
const state_js_1 = require("../../../../lib/state.js");
async function GET(_, { params }) {
    const kv = (0, kv_js_1.getKv)();
    await (0, state_js_1.ensureSeed)(kv, new Date().toISOString());
    const agents = await state_js_1.repo.agents(kv);
    const a = agents[params.id];
    if (!a)
        return (0, kv_js_1.json)({ error: "not found" }, 404);
    const meta = await state_js_1.repo.meta(kv);
    const [msgs, closed, openMap, learnings] = await Promise.all([
        state_js_1.repo.messages(kv, "c-general", 500), state_js_1.repo.closedOps(kv, 300), state_js_1.repo.openOps(kv), state_js_1.repo.learnings(kv, 300),
    ]);
    const ops = [...closed.filter((o) => o.agent_id === a.id), ...Object.values(openMap).filter((o) => o.agent_id === a.id)].slice(-10);
    return (0, kv_js_1.json)({
        ...a,
        suspended: meta.suspended.includes(a.id),
        history: msgs.filter((m) => m.from_agent_id === a.id).slice(-10),
        ops,
        school: learnings.filter((l) => l.agent_id === a.id).slice(0, 8),
    });
}
