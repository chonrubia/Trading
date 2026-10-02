"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// F2: repositorio KV (MemoryKv) + seed determinista.
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const store_js_1 = require("../store.js");
const state_js_1 = require("../state.js");
const seed_js_1 = require("../seed.js");
const rng_js_1 = require("../rng.js");
(0, node_test_1.test)("resolveKv: KV_* manda, REDIS_URL deriva REST", () => {
    strict_1.default.deepEqual((0, store_js_1.resolveKv)({ KV_REST_API_URL: "https://x.upstash.io/", KV_REST_API_TOKEN: "t" }), { url: "https://x.upstash.io", token: "t" });
    strict_1.default.deepEqual((0, store_js_1.resolveKv)({ REDIS_URL: "rediss://default:SECRETO@abc-123.upstash.io:6379" }), { url: "https://abc-123.upstash.io", token: "SECRETO" });
    strict_1.default.equal((0, store_js_1.resolveKv)({}), null);
});
(0, node_test_1.test)("MemoryKv roundtrip: string, hash, lista con trim", async () => {
    const kv = new store_js_1.MemoryKv();
    await kv.set("a", "1");
    strict_1.default.equal(await kv.get("a"), "1");
    strict_1.default.equal(await kv.get("nope"), null);
    await kv.hset("h", "f", "v");
    strict_1.default.deepEqual(await kv.hgetall("h"), { f: "v" });
    await kv.hdel("h", "f");
    strict_1.default.deepEqual(await kv.hgetall("h"), {});
    await kv.rpush("l", "1", "2", "3", "4");
    await kv.ltrim("l", -2, -1);
    strict_1.default.deepEqual(await kv.lrange("l", 0, -1), ["3", "4"]);
    strict_1.default.equal(await kv.llen("l"), 2);
    await kv.del("l");
    strict_1.default.equal(await kv.llen("l"), 0);
});
(0, node_test_1.test)("seed determinista: dos builds idénticos", () => {
    const a = (0, seed_js_1.buildSeed)((0, rng_js_1.seedRand)(42));
    const b = (0, seed_js_1.buildSeed)((0, rng_js_1.seedRand)(42));
    strict_1.default.equal(a.agents.length, 176);
    strict_1.default.equal(a.departments.length, 13);
    strict_1.default.deepEqual(a.agents.map(x => x.id), b.agents.map(x => x.id));
    strict_1.default.deepEqual(a.agents.map(x => x.strategy), b.agents.map(x => x.strategy));
    const c = (0, seed_js_1.buildSeed)((0, rng_js_1.seedRand)(43));
    strict_1.default.notDeepEqual(a.agents.map(x => x.strategy), c.agents.map(x => x.strategy));
});
(0, node_test_1.test)("ensureSeed crea fondo fresco 500€ una sola vez", async () => {
    const kv = new store_js_1.MemoryKv();
    strict_1.default.equal(await (0, state_js_1.ensureSeed)(kv, "2026-10-03T00:00:00.000Z"), true);
    strict_1.default.equal(await (0, state_js_1.ensureSeed)(kv, "2026-10-03T00:00:00.000Z"), false);
    const meta = await state_js_1.repo.meta(kv);
    strict_1.default.equal(meta.equity, 500);
    strict_1.default.equal(meta.opN, 1);
    const agents = await state_js_1.repo.agents(kv);
    strict_1.default.equal(Object.keys(agents).length, 176);
    strict_1.default.equal(agents["a-001"].name, "Dirección CIO · Vega");
    const traders = Object.values(agents).filter((x) => x.role === "Trader");
    strict_1.default.equal(traders.length, 158);
    strict_1.default.ok(traders.every((x) => x.pnl === 0));
});
(0, node_test_1.test)("repo: mensajes por canal + memoria con búsqueda", async () => {
    const kv = new store_js_1.MemoryKv();
    await (0, state_js_1.ensureSeed)(kv, "2026-10-03T00:00:00.000Z");
    const general = await state_js_1.repo.messages(kv, "c-general", 50);
    strict_1.default.ok(general.length >= 2);
    await state_js_1.repo.pushMemory(kv, { id: "e1", author: "T", dept: "x", pair: "BTC", text: "sesgo alcista fuerte", kind: "nota", ts: "t" });
    const found = await state_js_1.repo.memory(kv, "alcista", 10);
    strict_1.default.equal(found.length, 1);
    const empty = await state_js_1.repo.memory(kv, "zzz-nada", 10);
    strict_1.default.equal(empty.length, 0);
});
