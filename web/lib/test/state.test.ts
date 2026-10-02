// F2: repositorio KV (MemoryKv) + seed determinista.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryKv, resolveKv } from "../store.js";
import { ensureSeed, repo } from "../state.js";
import { buildSeed } from "../seed.js";
import { seedRand } from "../rng.js";

test("resolveKv: KV_* manda, REDIS_URL deriva REST", () => {
  assert.deepEqual(
    resolveKv({ KV_REST_API_URL: "https://x.upstash.io/", KV_REST_API_TOKEN: "t" }),
    { url: "https://x.upstash.io", token: "t" }
  );
  assert.deepEqual(
    resolveKv({ REDIS_URL: "rediss://default:SECRETO@abc-123.upstash.io:6379" }),
    { url: "https://abc-123.upstash.io", token: "SECRETO" }
  );
  assert.equal(resolveKv({}), null);
});

test("MemoryKv roundtrip: string, hash, lista con trim", async () => {
  const kv = new MemoryKv();
  await kv.set("a", "1");
  assert.equal(await kv.get("a"), "1");
  assert.equal(await kv.get("nope"), null);
  await kv.hset("h", "f", "v");
  assert.deepEqual(await kv.hgetall("h"), { f: "v" });
  await kv.hdel("h", "f");
  assert.deepEqual(await kv.hgetall("h"), {});
  await kv.rpush("l", "1", "2", "3", "4");
  await kv.ltrim("l", -2, -1);
  assert.deepEqual(await kv.lrange("l", 0, -1), ["3", "4"]);
  assert.equal(await kv.llen("l"), 2);
  await kv.del("l");
  assert.equal(await kv.llen("l"), 0);
});

test("seed determinista: dos builds idénticos", () => {
  const a = buildSeed(seedRand(42));
  const b = buildSeed(seedRand(42));
  assert.equal(a.agents.length, 176);
  assert.equal(a.departments.length, 13);
  assert.deepEqual(a.agents.map(x => x.id), b.agents.map(x => x.id));
  assert.deepEqual(a.agents.map(x => x.strategy), b.agents.map(x => x.strategy));
  const c = buildSeed(seedRand(43));
  assert.notDeepEqual(a.agents.map(x => x.strategy), c.agents.map(x => x.strategy));
});

test("ensureSeed crea fondo fresco 500€ una sola vez", async () => {
  const kv = new MemoryKv();
  assert.equal(await ensureSeed(kv, "2026-10-03T00:00:00.000Z"), true);
  assert.equal(await ensureSeed(kv, "2026-10-03T00:00:00.000Z"), false);
  const meta = await repo.meta(kv);
  assert.equal(meta.equity, 500);
  assert.equal(meta.opN, 1);
  const agents = await repo.agents(kv);
  assert.equal(Object.keys(agents).length, 176);
  assert.equal(agents["a-001"].name, "Dirección CIO · Vega");
  const traders = Object.values(agents).filter((x: any) => x.role === "Trader");
  assert.equal(traders.length, 158);
  assert.ok(traders.every((x: any) => x.pnl === 0));
});

test("repo: mensajes por canal + memoria con búsqueda", async () => {
  const kv = new MemoryKv();
  await ensureSeed(kv, "2026-10-03T00:00:00.000Z");
  const general = await repo.messages(kv, "c-general", 50);
  assert.ok(general.length >= 2);
  await repo.pushMemory(kv, { id: "e1", author: "T", dept: "x", pair: "BTC", text: "sesgo alcista fuerte", kind: "nota", ts: "t" });
  const found = await repo.memory(kv, "alcista", 10);
  assert.equal(found.length, 1);
  const empty = await repo.memory(kv, "zzz-nada", 10);
  assert.equal(empty.length, 0);
});
