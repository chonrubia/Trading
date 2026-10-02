// F0 caracterización: costs.js — congela comisiones al céntimo.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const c = require("../src/costs.js");

test("costPerSide por par y desk", () => {
  assert.equal(c.costPerSide("BTC", "spot"), 0.0014); // 0.001 + 0.0003 + 0.0001
  assert.equal(c.costPerSide("BTC", "derivados"), 0.0009); // 0.0005 + 0.0003 + 0.0001
  assert.equal(c.costPerSide("DOGE", "spot"), 0.0017);
  assert.equal(c.costPerSide("XXX", "spot"), 0.0017); // desconocido -> 0.0004
});

test("closeCosts y settle", () => {
  assert.equal(c.closeCosts(1, 100, 102, 0.0014), 0.28);
  assert.deepEqual(c.settle(5, 1, 100, 102, 0.0014), { net: 4.72, costs: 0.28 });
  assert.deepEqual(c.settle(-2, 0.01, 67000, 66800, 0.0014), { net: -3.87, costs: 1.87 });
});

test("roundtripPct y estOpen", () => {
  assert.equal(c.roundtripPct("BTC", "spot"), 0.28);
  assert.equal(c.estOpen(0.01, 67000, "BTC", "spot"), 1.88);
  assert.equal(c.SPOT_TAKER, 0.001);
  assert.equal(c.FUT_TAKER, 0.0005);
  assert.equal(c.SLIP, 0.0003);
});
