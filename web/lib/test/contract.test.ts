// F2/T23: contrato API sobre MemoryKv (mismo proceso: un solo registro).
// Las rutas usan getKv(); sin env KV resuelven al MemoryKv global del módulo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { GET as health } from "../../app/api/health/route.js";
import { GET as floor } from "../../app/api/floor/route.js";
import { GET as portfolio } from "../../app/api/portfolio/route.js";
import { GET as ranking } from "../../app/api/ranking/route.js";
import { POST as propose } from "../../app/api/operations/propose/route.js";
import { GET as ops } from "../../app/api/operations/route.js";
import { POST as kill } from "../../app/api/risk/kill/route.js";
import { POST as cstart } from "../../app/api/committee/start/route.js";
import { POST as cend } from "../../app/api/committee/end/route.js";
import { POST as chat } from "../../app/api/chat/route.js";
import { getKv } from "../../lib/kv.js";
import { repo } from "../../lib/state.js";

const J = async (r: Response) => r.json() as Promise<any>;
const post = (body: unknown) => new Request("http://x/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/** Publica un snapshot realista en el KV global para las rutas que exigen datos. */
async function publishMarket() {
  const kv = getKv();
  const meta = await repo.meta(kv);
  const now = new Date().toISOString();
  meta.stale = false;
  meta.last_candle_ts = now;
  meta.last_tick_at = now;
  await repo.saveMeta(kv, meta);
  const prices: Record<string, number> = {
    BTC: 70000, ETH: 2100, SOL: 130, XRP: 1.18, BNB: 670, DOGE: 0.07,
    ADA: 0.18, AVAX: 18, LINK: 10.4, NEAR: 2, TRX: 0.25, LTC: 52,
  };
  const lastTick = {
    ts: now, prices, change24h: {}, funding: 0.01, fear_greed: 50,
    risk_mode: "RISK-ON", regime: "trend", trend: {}, source: "binance",
    stale: false, lastCandleTs: now,
  };
  await repo.saveMarket(kv, {
    source: "binance", prices, change24h: {}, high24h: {}, low24h: {}, quoteVolume24h: {},
    funding: 0.01, fear_greed: 50, risk_mode: "RISK-ON", regime: "trend", trend: {},
    lastCandleTs: now, ageMs: 0, stale: false, ts: now, lastTick,
  });
}

test("contrato: health + floor con forma UI (paper real, sin datos aún)", async () => {
  const h: any = await J(await health());
  assert.equal(h.engine, "v2");
  assert.equal(h.mode, "paper-real");
  assert.equal(h.market_source, "binance");
  assert.equal(h.stale, true);
  assert.equal(h.ok, false);
  const f: any = await J(await floor());
  for (const k of ["tick", "equity", "dayPnl", "drawdown", "exposure", "kill", "committee", "counts", "msgs", "openOps"]) {
    assert.ok(k in f, `floor sin ${k}`);
  }
  assert.equal(f.equity, 60);
});

test("contrato: portfolio + ranking", async () => {
  const p: any = await J(await portfolio());
  for (const k of ["patrimonio", "resultado_hoy", "caida", "exposicion_bruta", "posiciones", "costes_pagados", "objetivo", "kill"]) {
    assert.ok(k in p, `portfolio sin ${k}`);
  }
  assert.equal(p.patrimonio, 60);
  const r: any = await J(await ranking());
  assert.equal(r.length, 50);
  assert.equal(r[0].rank, 1);
  for (const k of ["id", "name", "setup", "pair", "pnl"]) assert.ok(k in r[0], `ranking sin ${k}`);
});

test("contrato: propose aprueba con datos reales, kill bloquea, committee abre/cierra, chat responde", async () => {
  await publishMarket();
  const op1: any = await J(await propose(post({ side: "LONG", pair: "BTC" })));
  assert.equal(op1.status, "abierta");
  assert.ok(/^op-manual-\d+$/.test(op1.id));
  assert.equal(op1.side, "LONG");
  assert.equal(op1.desk, "spot");
  assert.ok(op1.notional <= 10.01);
  const k1: any = await J(await kill(post({ active: true })));
  assert.equal(k1.kill, true);
  const op2: any = await J(await propose(post({ side: "LONG" })));
  assert.equal(op2.status, "bloqueada");
  const k2: any = await J(await kill(post({ active: false })));
  assert.equal(k2.kill, false);
  const cs: any = await J(await cstart(post({ topic: "t" })));
  assert.equal(cs.active, true);
  const ce: any = await J(await (cend as any)());
  assert.ok(Array.isArray(ce.decisions) && ce.decisions.length > 0);
  const ch: any = await J(await chat(post({ text: "hola" })));
  assert.ok(ch.id && ch.reply);
  const list: any = await J(await ops(new Request("http://x/api/operations?limit=10") as any));
  assert.ok(Array.isArray(list) && list.length >= 2);
});

test("lock: segundo poseedor queda fuera hasta liberar", async () => {
  const { MemoryKv, withLock } = await import("../store.js");
  const kv = new MemoryKv();
  const r1 = await withLock(kv, "k", 60000, async () => "primero");
  assert.equal(r1.locked, false);
  await kv.setNx("k", "otro", 60000);
  const r2 = await withLock(kv, "k", 60000, async () => "segundo");
  assert.equal(r2.locked, true);
  assert.equal(r2.result, undefined);
});
