"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GET = GET;
const kv_js_1 = require("../../../../../lib/kv.js");
const state_js_1 = require("../../../../../lib/state.js");
async function GET(_, { params }) {
    const kv = (0, kv_js_1.getKv)();
    await (0, state_js_1.ensureSeed)(kv, new Date().toISOString());
    const [msgs, agentsMap] = await Promise.all([state_js_1.repo.messages(kv, params.id, 50), state_js_1.repo.agents(kv)]);
    const names = {};
    Object.values(agentsMap).forEach((a) => (names[a.id] = a.name));
    return (0, kv_js_1.json)(msgs.map((m) => ({ ...m, from: names[m.from_agent_id] || "Tú" })));
}
