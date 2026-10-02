"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// F1: lib/ pura con mismos goldens que F0 + determinismo de seams.
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const rng_js_1 = require("../rng.js");
const C = __importStar(require("../costs.js"));
const R = __importStar(require("../risk.js"));
const D = __importStar(require("../desks.js"));
const I = __importStar(require("../indicators.js"));
(0, node_test_1.test)("rng determinista", () => {
    const a = (0, rng_js_1.seedRand)(42), b = (0, rng_js_1.seedRand)(42);
    strict_1.default.equal(a(), b());
    strict_1.default.equal((0, rng_js_1.hashStr)("BTC"), (0, rng_js_1.hashStr)("BTC"));
    strict_1.default.notEqual((0, rng_js_1.hashStr)("BTC"), (0, rng_js_1.hashStr)("ETH"));
});
(0, node_test_1.test)("costs goldens F0", () => {
    strict_1.default.equal(C.costPerSide("BTC", "spot"), 0.0014);
    strict_1.default.equal(C.costPerSide("BTC", "derivados"), 0.0009);
    strict_1.default.equal(C.closeCosts(1, 100, 102, 0.0014), 0.28);
    strict_1.default.deepEqual(C.settle(5, 1, 100, 102, 0.0014), { net: 4.72, costs: 0.28 });
    strict_1.default.equal(C.roundtripPct("BTC", "spot"), 0.28);
    strict_1.default.equal(C.estOpen(0.01, 67000, "BTC", "spot"), 1.88);
});
(0, node_test_1.test)("risk goldens F0 (ctx inyectado, sin singletons)", () => {
    const AG = { id: "a-1", name: "T", leverage: 2, pnl: 0 };
    const ctx = (o = {}) => ({ equity: 500, killSwitch: false, suspended: [], openOps: [], ...o });
    let v = R.checkOperation(AG, { pair: "BTC", entry: 67000, size: 0.0001, leverage: 1 }, ctx({ killSwitch: true }));
    strict_1.default.equal(v.approved, false);
    v = R.checkOperation(AG, { pair: "ETH", entry: 3500, size: 0.004, leverage: 6 }, ctx());
    strict_1.default.equal(v.approved, true);
    strict_1.default.equal(v.leverage, 5);
    v = R.checkOperation(AG, { pair: "ETH", entry: 3500, size: 0.03, leverage: 1 }, ctx({ openOps: [{ status: "abierta", size: 0.01, entry: 67000 }] }));
    strict_1.default.equal(v.approved, false);
    v = R.checkOperation({ ...AG, pnl: -200 }, { pair: "BTC", entry: 67000, size: 0.002, leverage: 1 }, ctx());
    strict_1.default.equal(v.approved, true);
    strict_1.default.equal(v.size, 0.0001);
    strict_1.default.equal(R.fundExposure([{ status: "abierta", size: 1, entry: 100 }], 500), 20);
});
(0, node_test_1.test)("desks goldens F0 + pureza venues/scanArb", () => {
    strict_1.default.equal(D.spreadOf({ a: 100, b: 100.2 }), 0.19980019980020267);
    strict_1.default.equal(D.arbCostPct("BTC"), 0.5599999999999999);
    strict_1.default.deepEqual(D.arbPnl(0.8, 0.2, "BTC", 150), { net: 0.06, costs: 0.84 });
    strict_1.default.equal(D.hedgeSignal(85, 1), "open");
    strict_1.default.equal(D.hedgeSignal(40, 1), "close");
    const r1 = (0, rng_js_1.seedRand)(7), r2 = (0, rng_js_1.seedRand)(7);
    const v1 = D.venues({ BTC: 67000 }, {}, r1), v2 = D.venues({ BTC: 67000 }, {}, r2);
    strict_1.default.deepEqual(v1, v2);
    const s1 = D.scanArb({ BTC: { a: 67000, b: 67600, eps: 0.009 } }, 0, (0, rng_js_1.seedRand)(7));
    const s2 = D.scanArb({ BTC: { a: 67000, b: 67600, eps: 0.009 } }, 0, (0, rng_js_1.seedRand)(7));
    strict_1.default.deepEqual(s1, s2);
    strict_1.default.equal(s1?.pair, "BTC");
});
(0, node_test_1.test)("indicators goldens F0 + robustness determinista", () => {
    const e = I.ema([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 3).map(x => Math.round(x * 1000) / 1000);
    strict_1.default.deepEqual(e, [1, 1.5, 2.25, 3.125, 4.063, 5.031, 6.016, 7.008, 8.004, 9.002]);
    const m = I.metrics(I.runTrades({ kind: "ema", p1: 9, pair: "BTC" }, I.genHistory("BTC")));
    strict_1.default.deepEqual(m, { trades: 37, total: 2298.8, win: 78.4, pf: 13.15, dd: 134, sharpe: 15.95 });
    const r1 = I.robustness({ kind: "ema", p1: 9, pair: "BTC" }, I.genHistory("BTC"), (0, rng_js_1.seedRand)(99));
    const r2 = I.robustness({ kind: "ema", p1: 9, pair: "BTC" }, I.genHistory("BTC"), (0, rng_js_1.seedRand)(99));
    strict_1.default.deepEqual(r1, r2);
    const q = I.qualify({ kind: "ema", p1: 9, pair: "BTC" });
    strict_1.default.equal(q.status, "incubacion");
    const bad = I.qualify({ kind: "rsi", p1: 7, pair: "DOGE" });
    strict_1.default.equal(bad.status, "descartada");
});
