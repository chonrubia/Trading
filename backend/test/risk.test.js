// F0 caracterización: risk.js checkOperation — matriz de decisión.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const r = require("../src/risk.js");

const AG = { id: "a-1", name: "T", leverage: 2, pnl: 0 };
const ctx = (o = {}) => ({ equity: 500, dayPnl: 0, drawdown: 0, openOps: [], prices: {}, ...o });

test("kill-switch bloquea todo", () => {
  r.setKill(true);
  const v = r.checkOperation(AG, { pair: "BTC", entry: 67000, size: 0.0001, leverage: 1 }, ctx());
  assert.equal(v.approved, false);
  assert.match(v.reason, /KILL-SWITCH/);
  r.setKill(false);
  assert.equal(r.isKilled(), false);
});

test("suspendido bloquea", () => {
  r.suspended.add("a-1");
  const v = r.checkOperation(AG, { pair: "BTC", entry: 67000, size: 0.0001, leverage: 1 }, ctx());
  assert.equal(v.approved, false);
  assert.match(v.reason, /suspendido/);
  r.suspended.delete("a-1");
});

test("leverage 6 se recorta a 5 y aprueba", () => {
  const v = r.checkOperation(AG, { pair: "ETH", entry: 3500, size: 0.004, leverage: 6 }, ctx());
  assert.equal(v.approved, true);
  assert.equal(v.leverage, 5);
  assert.match(v.reason, /recortado/);
});

test("exposición >150% bloquea", () => {
  const open = [{ status: "abierta", size: 0.01, entry: 67000 }]; // 670€ nocional
  const v = r.checkOperation(AG, { pair: "ETH", entry: 3500, size: 0.03, leverage: 1 }, ctx({ openOps: open }));
  assert.equal(v.approved, false);
  assert.match(v.reason, /Exposici/);
});

test("concentración >30% por par bloquea", () => {
  const open = [{ status: "abierta", pair: "BTC", size: 0.002, entry: 67000 }]; // 134€
  const v = r.checkOperation(AG, { pair: "BTC", entry: 67000, size: 0.001, leverage: 1 }, ctx({ openOps: open }));
  assert.equal(v.approved, false);
  assert.match(v.reason, /Concentraci/);
});

test("agente en drawdown recorta a 10€ nocional", () => {
  const poor = { ...AG, pnl: -200 };
  const v = r.checkOperation(poor, { pair: "BTC", entry: 67000, size: 0.002, leverage: 1 }, ctx());
  assert.equal(v.approved, true);
  assert.equal(v.size, 0.0001); // cap 10/67000 redondeado a 4 decimales
});

test("nominal OK", () => {
  const v = r.checkOperation(AG, { pair: "LINK", entry: 18, size: 1, leverage: 2 }, ctx());
  assert.equal(v.approved, true);
  assert.equal(v.reason, "Riesgos: OK");
});

test("fundExposure", () => {
  assert.equal(r.fundExposure([], 500), 0);
  assert.equal(r.fundExposure([{ status: "abierta", size: 1, entry: 100 }], 500), 20);
  assert.equal(r.fundExposure([{ status: "cerrada", size: 1, entry: 100 }], 500), 0);
});
