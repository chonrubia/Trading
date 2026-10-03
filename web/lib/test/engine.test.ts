// F3: motor por pasos — determinismo, primer tick, comité y rollover.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryKv } from "../store.js";
import { ensureSeed } from "../state.js";
import { loadEngine, saveEngine, step } from "../engine.js";
import { seedRand, hashStr } from "../rng.js";

async function fresh() {
  const kv = new MemoryKv();
  await ensureSeed(kv, "2026-10-04T10:00:00.000Z");
  return kv;
}
const snap = (s: any) => JSON.stringify(s);

test("determinismo: mismo slot + mismo estado = mismo resultado", async () => {
  const a = await fresh(), b = await fresh();
  const sa = await loadEngine(a), sb = await loadEngine(b);
  const ra = step(sa, { slot: "2026-10-04T10:00", nowIso: "2026-10-04T10:00:00.000Z", rnd: seedRand(hashStr("2026-10-04T10:00")) });
  const rb = step(sb, { slot: "2026-10-04T10:00", nowIso: "2026-10-04T10:00:00.000Z", rnd: seedRand(hashStr("2026-10-04T10:00")) });
  assert.equal(snap(ra.state), snap(rb.state));
  assert.equal(snap(ra.events), snap(rb.events));
  assert.equal(ra.state.meta.tickN, 1);
});

test("primeros ticks: mercado avanza, hay mensajes y operaciones", async () => {
  const kv = await fresh();
  let s = await loadEngine(kv);
  const p0 = s.market.prices.BTC;
  for (let i = 0; i < 5; i++) {
    const r = step(s, { slot: `2026-10-04T10:0${i}`, nowIso: `2026-10-04T10:0${i}:00.000Z`, rnd: seedRand(hashStr("s" + i)) });
    s = r.state;
  }
  assert.equal(s.meta.tickN, 5);
  assert.notEqual(s.market.prices.BTC, p0);
  assert.ok(s.msgs.length >= 2 + 5, "chat crece");
  const nOps = Object.keys(s.openOps).length + s.closed.length + s.blocked.length;
  assert.ok(nOps > 0, "hay operaciones");
  const tickEv = s.meta.tickN;
  assert.equal(tickEv, 5);
});

test("comité: 11 steps lo abren y cierran con acta", async () => {
  const kv = await fresh();
  let s = await loadEngine(kv);
  s.committee = { active: true, topic: "t", started_at: s.meta.today, ticks: 0, backup: {}, log: [] };
  for (let i = 0; i < 11; i++) {
    const r = step(s, { slot: `c-${i}`, nowIso: `2026-10-04T11:${String(i).padStart(2, "0")}:00.000Z`, rnd: seedRand(hashStr("c" + i)) });
    s = r.state;
  }
  assert.equal(s.committee.active, false);
  assert.equal(s.meetings.length, 1);
  assert.ok(s.meetings[0].decisions.length >= 3);
});

test("rollover: registra el día y resetea topes", async () => {
  const kv = await fresh();
  let s = await loadEngine(kv);
  s.meta.equity = 512;
  s.day.trades["a-019"] = 3;
  const r = step(s, { slot: "2026-10-05T00:00", nowIso: "2026-10-05T00:00:00.000Z", rnd: seedRand(1) });
  assert.equal(r.state.meta.today, "2026-10-05");
  assert.deepEqual(r.state.targetDays["2026-10-04"], { pnl: 12, hit: false });
  assert.deepEqual(r.state.day.trades, {});
});

test("save/load roundtrip conserva el estado", async () => {
  const kv = await fresh();
  let s = await loadEngine(kv);
  s = step(s, { slot: "k1", nowIso: "2026-10-04T12:00:00.000Z", rnd: seedRand(5) }).state;
  await saveEngine(kv, s);
  const s2 = await loadEngine(kv);
  assert.equal(snap(s2.meta), snap(s.meta));
  assert.equal(Object.keys(s2.openOps).length, Object.keys(s.openOps).length);
  assert.equal(s2.day.trades && typeof s2.day.trades, "object");
});

test("save/load roundtrip conserva el aprendizaje (sin olvido entre ticks)", async () => {
  const kv = await fresh();
  let s = await loadEngine(kv);
  // muestra de aprendizaje fabricada: lo que step() genera en un tick real
  s.closed.push({ id: "op-test-1", agent_id: "a-019", pair: "BTC", side: "LONG", entry: 100, exit: 101, size: 1, leverage: 1, pnl: 0.9, status: "cerrada", close_reason: "TP +0.7%" });
  s.blocked.push({ id: "op-test-b1", agent_id: "a-019", pair: "ETH", side: "LONG", entry: 100, size: 1, leverage: 1, status: "bloqueada", risk_note: "test" });
  s.msgs.push({ id: "m-test-1", channel_id: "c-general", from_agent_id: "a-019", text: "lección test", kind: "idea", created_at: "2026-10-04T12:00:00.000Z" });
  s.meetings.unshift({ id: "meet-test-1", topic: "t", decisions: ["d1"], top3: [] });
  s.memory.unshift({ id: "mem-test-1", ts: "2026-10-04T12:00:00.000Z", author: "T", dept: "trading", pair: "BTC", text: "lección", kind: "leccion-ganada" });
  s.learnings.unshift({ agent_id: "a-019", subject: "tecnico", xp: 8, note: "TP", ts: "2026-10-04T12:00:00.000Z" });
  s.xp["a-019"] = { tecnico: 8 };
  s.snapshots.push({ ts: "2026-10-04T12:00:00.000Z", equity: 500, dayPnl: 0, drawdown: 0, exposure: 0 });
  s.audit.push({ ts: "2026-10-04T12:00:00.000Z", ev: "op.close", id: "op-test-1" });
  s.targetDays["2026-10-03"] = { pnl: 12, hit: false };
  await saveEngine(kv, s);
  const s2 = await loadEngine(kv);
  assert.ok(s2.closed.some((o: any) => o.id === "op-test-1"), "cerradas persisten (expectancy)");
  assert.ok(s2.blocked.some((o: any) => o.id === "op-test-b1"), "bloqueadas persisten");
  assert.ok(s2.msgs.some((m: any) => m.id === "m-test-1"), "chat persiste");
  assert.ok(s2.meetings.some((m: any) => m.id === "meet-test-1"), "actas persisten");
  assert.ok(s2.memory.some((e: any) => e.id === "mem-test-1"), "memoria persiste (voto ±0.15)");
  assert.ok(s2.learnings.some((l: any) => l.note === "TP"), "learnings persisten");
  assert.deepEqual(s2.xp["a-019"], { tecnico: 8 });
  assert.ok(s2.snapshots.some((x: any) => x.ts === "2026-10-04T12:00:00.000Z"), "snapshots persisten");
  assert.ok(s2.audit.some((e: any) => e.ev === "op.close" && e.id === "op-test-1"), "auditoría persiste");
  assert.deepEqual(s2.targetDays["2026-10-03"], { pnl: 12, hit: false });
  // idempotencia: guardar dos veces no duplica
  await saveEngine(kv, s);
  const s3 = await loadEngine(kv);
  assert.equal(s3.closed.filter((o: any) => o.id === "op-test-1").length, 1);
  assert.equal(s3.memory.filter((e: any) => e.id === "mem-test-1").length, 1);
});
