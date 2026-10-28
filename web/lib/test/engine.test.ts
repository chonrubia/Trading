// F3: motor por pasos — determinismo, datos reales, comité y rollover.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryKv } from "../store.js";
import { ensureSeed } from "../state.js";
import { loadEngine, saveEngine, step } from "../engine.js";
import { seedRand, hashStr } from "../rng.js";
import { buildRealMarket } from "../market-real.js";
import { PAIRS, SYMBOLS, type Candle, type Ticker } from "../binance.js";

const NOW = Date.parse("2026-10-04T10:00:00.000Z");

/** Serie sintética determinista SOLO para tests; el motor recibe un snapshot real. */
function series(n: number, stepMs: number, drift: number, base: number): Candle[] {
  const out: Candle[] = [];
  let px = base;
  for (let i = 0; i < n; i++) {
    const openTime = NOW - (n - i) * stepMs;
    const open = px;
    const close = px * (1 + drift + 0.0004 * Math.sin(i / 7));
    out.push({
      openTime, open,
      high: Math.max(open, close) * 1.001,
      low: Math.min(open, close) * 0.999,
      close, volume: 100, closeTime: openTime + stepMs - 1, trades: 10,
    });
    px = close;
  }
  return out;
}

/** Snapshot con tendencia alcista sostenida: EMA y Donchian dan LONG. */
export function fixtureMarket() {
  const tickers: Record<string, Ticker> = {};
  const klines15m: Record<string, Candle[]> = {};
  const klines1d: Record<string, Candle[]> = {};
  PAIRS.forEach((pair, i) => {
    const m15 = series(400, 15 * 60_000, 0.001, 100 + i);
    const d1 = series(120, 24 * 60 * 60_000, 0.004, 90 + i);
    klines15m[pair] = m15;
    klines1d[pair] = d1;
    const last = m15[m15.length - 1];
    tickers[pair] = {
      symbol: SYMBOLS[pair], pair, price: last.close, changePct: 1.5,
      high: last.high, low: last.low, quoteVolume: 1_000_000, closeTime: NOW - 1000,
    };
  });
  return buildRealMarket({
    tickers, klines15m, klines1d,
    funding: 0.01, fearGreed: 55, nowMs: NOW,
  });
}

async function fresh() {
  const kv = new MemoryKv();
  await ensureSeed(kv, "2026-10-04T10:00:00.000Z");
  return kv;
}
const snap = (s: any) => JSON.stringify(s);
const input = (slot: string, isoTs: string, seed: number | string = slot) => ({
  slot, nowIso: isoTs, rnd: seedRand(typeof seed === "number" ? seed : hashStr(seed)), market: fixtureMarket(),
});

test("determinismo: mismo slot + mismo estado = mismo resultado", async () => {
  const a = await fresh(), b = await fresh();
  const sa = await loadEngine(a), sb = await loadEngine(b);
  const ra = step(sa, input("2026-10-04T10:00", "2026-10-04T10:00:00.000Z", "2026-10-04T10:00"));
  const rb = step(sb, input("2026-10-04T10:00", "2026-10-04T10:00:00.000Z", "2026-10-04T10:00"));
  assert.equal(snap(ra.state), snap(rb.state));
  assert.equal(snap(ra.events), snap(rb.events));
  assert.equal(ra.state.meta.tickN, 1);
});

test("tick con datos reales: snapshot Binance, mensajes y operaciones spot", async () => {
  const kv = await fresh();
  let s = await loadEngine(kv);
  const m = fixtureMarket();
  const p0 = m.prices.BTC;
  for (let i = 0; i < 5; i++) {
    const r = step(s, { ...input(`2026-10-04T10:0${i}`, `2026-10-04T10:0${i}:00.000Z`, "s" + i), market: m });
    s = r.state;
  }
  assert.equal(s.meta.tickN, 5);
  assert.equal(s.market.source, "binance");
  assert.equal(s.market.prices.BTC, p0);
  assert.ok(!s.market.stale);
  assert.ok(s.msgs.length >= 2 + 5, "chat crece");
  const nOps = Object.keys(s.openOps).length + s.closed.length + s.blocked.length;
  assert.ok(nOps > 0, "hay operaciones");
  assert.ok(Object.keys(s.openOps).length <= 3, "máximo 3 posiciones spot");
  for (const o of Object.values(s.openOps) as any[]) {
    assert.equal(o.leverage, undefined);
    assert.equal(o.side, "LONG");
    assert.equal(o.desk, "spot");
    assert.ok(o.notional <= 10.01, "máximo 10€ por orden");
  }
});

test("stale: el motor se niega a avanzar sin datos frescos", async () => {
  const kv = await fresh();
  const s = await loadEngine(kv);
  const m = { ...fixtureMarket(), stale: true };
  assert.throws(() => step(s, { ...input("stale", "2026-10-04T10:00:00.000Z", 1), market: m }), /stale/);
});

test("comité: 11 steps lo abren y cierran con acta", async () => {
  const kv = await fresh();
  let s = await loadEngine(kv);
  s.committee = { active: true, topic: "t", started_at: s.meta.today, ticks: 0, backup: {}, log: [] };
  for (let i = 0; i < 11; i++) {
    const r = step(s, input(`c-${i}`, `2026-10-04T11:${String(i).padStart(2, "0")}:00.000Z`, "c" + i));
    s = r.state;
  }
  assert.equal(s.committee.active, false);
  assert.equal(s.meetings.length, 1);
  assert.ok(s.meetings[0].decisions.length >= 3);
});

test("rollover: registra el día y resetea topes", async () => {
  const kv = await fresh();
  let s = await loadEngine(kv);
  s.meta.dayStartEquity = 60;
  s.meta.equity = 72;
  s.day.trades["a-019"] = 3;
  const r = step(s, input("2026-10-05T00:00", "2026-10-05T00:00:00.000Z", 1));
  assert.equal(r.state.meta.today, "2026-10-05");
  assert.deepEqual(r.state.targetDays["2026-10-04"], { pnl: 12, trades: 0, equity: 72, hit: true });
  assert.equal(r.state.day.trades["a-019"], undefined, "los topes del día anterior se borran");
});

test("save/load roundtrip conserva el estado", async () => {
  const kv = await fresh();
  let s = await loadEngine(kv);
  s = step(s, input("k1", "2026-10-04T12:00:00.000Z", 5)).state;
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
  s.closed.push({
    id: "op-test-1", agent_id: "a-019", agent_name: "T", strategy: "S", pair: "BTC", side: "LONG",
    qty: 0.001, entry: 100, entry_fill: 100.1, entry_fee: 0.01, cost: 10, notional: 10,
    opened_at: "2026-10-04T12:00:00.000Z", stop: 99, target: 102, maxLife: 10, life: 1,
    pnl: 0.9, pnl_pct: 9, mfe: 9, status: "cerrada", desk: "spot",
    exit: 101, exit_fill: 100.9, exit_fee: 0.01, fees: 0.02, closed_at: "2026-10-04T12:00:00.000Z",
    close_reason: "TP",
  });
  s.blocked.push({ id: "op-test-b1", agent_id: "a-019", pair: "ETH", side: "LONG", entry: 100, size: 1, leverage: 1, status: "bloqueada", risk_note: "test" });
  s.msgs.push({ id: "m-test-1", channel_id: "c-general", from_agent_id: "a-019", text: "lección test", kind: "idea", created_at: "2026-10-04T12:00:00.000Z" });
  s.meetings.unshift({ id: "meet-test-1", topic: "t", decisions: ["d1"], top3: [] });
  s.memory.unshift({ id: "mem-test-1", ts: "2026-10-04T12:00:00.000Z", author: "T", dept: "trading", pair: "BTC", text: "lección", kind: "leccion-ganada" });
  s.learnings.unshift({ agent_id: "a-019", subject: "tecnico", xp: 8, note: "TP", ts: "2026-10-04T12:00:00.000Z" });
  s.xp["a-019"] = { tecnico: 8 };
  s.snapshots.push({ ts: "2026-10-04T12:00:00.000Z", equity: 60, dayPnl: 0, drawdown: 0, exposure: 0 });
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
