// F0 caracterización: incubator.js funciones puras (vía _pure).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const P = require("../src/incubator.js")._pure;

test("ema vector congelado", () => {
  const out = P.ema([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 3).map(x => Math.round(x * 1000) / 1000);
  assert.deepEqual(out, [1, 1.5, 2.25, 3.125, 4.063, 5.031, 6.016, 7.008, 8.004, 9.002]);
});

test("rsi último valor congelado", () => {
  const r = P.rsi([10, 11, 12, 13, 14, 15, 16, 15, 14, 13, 12, 11, 10, 11, 12, 13, 14, 15, 16, 17], 14);
  assert.equal(r.length, 20);
  assert.ok(Math.abs(r[19] - 71.71374877202058) < 1e-9);
});

test("genHistory determinista por par", () => {
  const a = P.genHistory("BTC"), b = P.genHistory("BTC"), c = P.genHistory("ETH");
  assert.equal(a.length, 500);
  assert.deepEqual(a.slice(0, 5), b.slice(0, 5));
  assert.notDeepEqual(a.slice(0, 5), c.slice(0, 5));
});

test("runTrades+metrics EMA9/BTC congelados", () => {
  const m = P.metrics(P.runTrades({ kind: "ema", p1: 9 }, P.genHistory("BTC")));
  assert.deepEqual(m, { trades: 37, total: 2298.8, win: 78.4, pf: 13.15, dd: 134, sharpe: 15.95 });
});

test("metrics vacío", () => {
  assert.deepEqual(P.metrics([]), { trades: 0, total: 0, win: 0, pf: 0, dd: 100, sharpe: -9 });
});

test("liveSignal por kind", () => {
  const up = Array.from({ length: 60 }, (_, i) => 100 + i);
  const dn = Array.from({ length: 60 }, (_, i) => 160 - i);
  assert.equal(P.liveSignal({ kind: "ema", p1: 5 }, up), 1);
  assert.equal(P.liveSignal({ kind: "ema", p1: 5 }, dn), -1);
});
