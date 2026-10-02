"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GET = GET;
const kv_js_1 = require("../../../lib/kv.js");
const store_js_1 = require("../../../lib/store.js");
// Diagnóstico: ¿contra qué KV hablamos? NO expone secretos.
async function GET() {
    const found = (0, store_js_1.resolveKv)(process.env);
    const kv = (0, kv_js_1.getKv)();
    const key = `diag:${Date.now()}`;
    try {
        await kv.set(key, "1");
        const back = await kv.get(key);
        await kv.del(key);
        return (0, kv_js_1.json)({ backend: found ? "upstash" : "memory", readback: back === "1" ? "ok" : "FAIL", ts: new Date().toISOString() });
    }
    catch (e) {
        return (0, kv_js_1.json)({ backend: found ? "upstash" : "memory", readback: "FAIL", error: String(e?.message || e).slice(0, 120) }, 500);
    }
}
