// F1: lib/ pura con mismos goldens que F0 + determinismo de seams.
import { test } from "node:test";
import assert from "node:assert/strict";
import { seedRand, hashStr } from "../rng.js";
import * as C from "../costs.js";
import * as R from "../risk.js";
import * as D from "../desks.js";
import * as I from "../indicators.js";

test("rng determinista", () => {
  const a = seedRand(42), b = seedRand(42);
  assert.equal(a(), b());
  assert.equal(hashStr("BTC"), hashStr("BTC"));
  assert.notEqual(hashStr("BTC"), hashStr("ETH"));
});

test("costs goldens F0", () => {
  assert.equal(C.costPerSide("BTC", "spot"), 0.0014);
  assert.equal(C.costPerSide("BTC", "derivados"), 0.0009);
  assert.equal(C.closeCosts(1, 100, 102, 0.0014), 0.28);
  assert.deepEqual(C.settle(5, 1, 100, 102, 0.0014), { net: 4.72, costs: 0.28 });
  assert.equal(C.roundtripPct("BTC", "spot"), 0.28);
  assert.equal(C.estOpen(0.01, 67000, "BTC", "spot"), 1.88);
});

test("risk goldens F0 (ctx inyectado, sin singletons)", () => {
  const AG = { id: "a-1", name: "T", leverage: 2, pnl: 0 };
  const ctx = (o = {}) => ({ equity: 500, killSwitch: false, suspended: [] as string[], openOps: [] as R.OpenOp[], ...o });
  let v = R.checkOperation(AG, { pair: "BTC", entry: 67000, size: 0.0001, leverage: 1 }, ctx({ killSwitch: true }));
  assert.equal(v.approved, false);
  v = R.checkOperation(AG, { pair: "ETH", entry: 3500, size: 0.004, leverage: 6 }, ctx());
  assert.equal(v.approved, true); assert.equal(v.leverage, 5);
  v = R.checkOperation(AG, { pair: "ETH", entry: 3500, size: 0.03, leverage: 1 }, ctx({ openOps: [{ status: "abierta", size: 0.01, entry: 67000 }] }));
  assert.equal(v.approved, false);
  v = R.checkOperation({ ...AG, pnl: -200 }, { pair: "BTC", entry: 67000, size: 0.002, leverage: 1 }, ctx());
  assert.equal(v.approved, true); assert.equal(v.size, 0.0001);
  assert.equal(R.fundExposure([{ status: "abierta", size: 1, entry: 100 }], 500), 20);
});

test("desks goldens F0 + pureza venues/scanArb", () => {
  assert.equal(D.spreadOf({ a: 100, b: 100.2 }), 0.19980019980020267);
  assert.equal(D.arbCostPct("BTC"), 0.5599999999999999);
  assert.deepEqual(D.arbPnl(0.8, 0.2, "BTC", 150), { net: 0.06, costs: 0.84 });
  assert.equal(D.hedgeSignal(85, 1), "open");
  assert.equal(D.hedgeSignal(40, 1), "close");
  const r1 = seedRand(7), r2 = seedRand(7);
  const v1 = D.venues({ BTC: 67000 }, {}, r1), v2 = D.venues({ BTC: 67000 }, {}, r2);
  assert.deepEqual(v1, v2);
  const s1 = D.scanArb({ BTC: { a: 67000, b: 67600, eps: 0.009 } }, 0, seedRand(7));
  const s2 = D.scanArb({ BTC: { a: 67000, b: 67600, eps: 0.009 } }, 0, seedRand(7));
  assert.deepEqual(s1, s2);
  assert.equal(s1?.pair, "BTC");
});

test("indicators goldens F0 + robustness determinista", () => {
  const e = I.ema([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 3).map(x => Math.round(x * 1000) / 1000);
  assert.deepEqual(e, [1, 1.5, 2.25, 3.125, 4.063, 5.031, 6.016, 7.008, 8.004, 9.002]);
  const m = I.metrics(I.runTrades({ kind: "ema", p1: 9, pair: "BTC" }, I.genHistory("BTC")));
  assert.deepEqual(m, { trades: 37, total: 2298.8, win: 78.4, pf: 13.15, dd: 134, sharpe: 15.95 });
  const r1 = I.robustness({ kind: "ema", p1: 9, pair: "BTC" }, I.genHistory("BTC"), seedRand(99));
  const r2 = I.robustness({ kind: "ema", p1: 9, pair: "BTC" }, I.genHistory("BTC"), seedRand(99));
  assert.deepEqual(r1, r2);
  const q = I.qualify({ kind: "ema", p1: 9, pair: "BTC" });
  assert.equal(q.status, "incubacion");
  const bad = I.qualify({ kind: "rsi", p1: 7, pair: "DOGE" });
  assert.equal(bad.status, "descartada");
});
