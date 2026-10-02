"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.json = void 0;
exports.getKv = getKv;
exports.body = body;
// Acceso KV: Upstash REST en producción, memoria en local sin env.
// Soporta KV_REST_API_URL/TOKEN y deriva REST desde REDIS_URL.
const store_js_1 = require("../lib/store.js");
let mem = null;
function getKv() {
    const found = (0, store_js_1.resolveKv)(process.env);
    if (found)
        return new store_js_1.UpstashKv(found.url, found.token);
    if (!mem)
        mem = new store_js_1.MemoryKv();
    return mem;
}
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
exports.json = json;
async function body(req) {
    try {
        return (await req.json());
    }
    catch {
        return {};
    }
}
