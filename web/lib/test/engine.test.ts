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
