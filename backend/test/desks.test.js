// F0 caracterización: desks.js funciones puras.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const d = require("../src/desks.js");

test("spreadOf", () => {
  assert.equal(d.spreadOf({ a: 100, b: 100.2 }), 0.19980019980020267);
  assert.equal(d.spreadOf({ a: 50, b: 50 }), 0);
});

test("arbCostPct por par (4 patas taker)", () => {
  assert.equal(d.arbCostPct("BTC"), 0.5599999999999999); // 4*(0.001+0.0003+0.0001)*100 en float
  assert.ok(d.arbCostPct("NEAR") > d.arbCostPct("BTC"));
});

test("arbPnl captura menos costes", () => {
  // gross=(0.8-0.2)/100*150=0.9, costs=150*0.0056=0.84 -> net 0.06
  assert.deepEqual(d.arbPnl(0.8, 0.2, "BTC", 150), { net: 0.06, costs: 0.84 });
  const loss = d.arbPnl(0.2, 0.8, "BTC", 150);
  assert.ok(loss.net < 0);
});

test("hedgeSignal", () => {
  assert.equal(d.hedgeSignal(85, 1), "open");
  assert.equal(d.hedgeSignal(10, 5), "open");
  assert.equal(d.hedgeSignal(40, 1), "close");
  assert.equal(d.hedgeSignal(60, 2), null);
});

test("deskPnl agrupa y sin desk va a spot", () => {
  const ops = [
    { desk: "spot", status: "cerrada", pnl: 2 },
    { status: "cerrada", pnl: 3 },
    { desk: "arbitraje", status: "abierta", pnl: 1.5 },
    { desk: "derivados", status: "cerrada", pnl: -1 },
  ];
  assert.deepEqual(d.deskPnl(ops), { spot: 5, arbitraje: 1.5, derivados: -1, cobertura: 0 });
});
