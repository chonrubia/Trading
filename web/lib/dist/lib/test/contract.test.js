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
// F2/T23: contrato API sobre MemoryKv (mismo proceso: un solo registro).
// Las rutas usan getKv(); sin env KV resuelven al MemoryKv global del módulo.
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const route_js_1 = require("../../app/api/health/route.js");
const route_js_2 = require("../../app/api/floor/route.js");
const route_js_3 = require("../../app/api/portfolio/route.js");
const route_js_4 = require("../../app/api/ranking/route.js");
const route_js_5 = require("../../app/api/operations/propose/route.js");
const route_js_6 = require("../../app/api/operations/route.js");
const route_js_7 = require("../../app/api/risk/kill/route.js");
const route_js_8 = require("../../app/api/committee/start/route.js");
const route_js_9 = require("../../app/api/committee/end/route.js");
const route_js_10 = require("../../app/api/chat/route.js");
const J = async (r) => r.json();
const post = (body) => new Request("http://x/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
(0, node_test_1.test)("contrato: health + floor con forma UI", async () => {
    const h = await J(await (0, route_js_1.GET)());
    strict_1.default.equal(h.ok, true);
    strict_1.default.equal(h.agents, 176);
    const f = await J(await (0, route_js_2.GET)());
    for (const k of ["tick", "equity", "dayPnl", "drawdown", "exposure", "kill", "committee", "counts", "msgs", "openOps"]) {
        strict_1.default.ok(k in f, `floor sin ${k}`);
    }
    strict_1.default.equal(f.equity, 500);
});
(0, node_test_1.test)("contrato: portfolio + ranking", async () => {
    const p = await J(await (0, route_js_3.GET)());
    for (const k of ["patrimonio", "resultado_hoy", "caida", "exposicion_bruta", "posiciones", "costes_pagados", "objetivo", "kill"]) {
        strict_1.default.ok(k in p, `portfolio sin ${k}`);
    }
    const r = await J(await (0, route_js_4.GET)());
    strict_1.default.equal(r.length, 50);
    strict_1.default.equal(r[0].rank, 1);
    for (const k of ["id", "name", "setup", "pair", "pnl"])
        strict_1.default.ok(k in r[0], `ranking sin ${k}`);
});
(0, node_test_1.test)("contrato: propose aprueba, kill bloquea, committee abre/cierra, chat responde", async () => {
    const op1 = await J(await (0, route_js_5.POST)(post({ side: "LONG", pair: "BTC" })));
    strict_1.default.equal(op1.status, "abierta");
    strict_1.default.ok(/^op-\d+$/.test(op1.id));
    const k1 = await J(await (0, route_js_7.POST)(post({ active: true })));
    strict_1.default.equal(k1.kill, true);
    const op2 = await J(await (0, route_js_5.POST)(post({ side: "LONG" })));
    strict_1.default.equal(op2.status, "bloqueada");
    const k2 = await J(await (0, route_js_7.POST)(post({ active: false })));
    strict_1.default.equal(k2.kill, false);
    const cs = await J(await (0, route_js_8.POST)(post({ topic: "t" })));
    strict_1.default.equal(cs.active, true);
    const ce = await J(await route_js_9.POST());
    strict_1.default.ok(Array.isArray(ce.decisions) && ce.decisions.length > 0);
    const ch = await J(await (0, route_js_10.POST)(post({ text: "hola" })));
    strict_1.default.ok(ch.id && ch.reply);
    const list = await J(await (0, route_js_6.GET)(new Request("http://x/api/operations?limit=10")));
    strict_1.default.ok(Array.isArray(list) && list.length >= 2);
});
(0, node_test_1.test)("lock: segundo poseedor queda fuera hasta liberar", async () => {
    const { MemoryKv, withLock } = await Promise.resolve().then(() => __importStar(require("../store.js")));
    const kv = new MemoryKv();
    const r1 = await withLock(kv, "k", 60000, async () => "primero");
    strict_1.default.equal(r1.locked, false);
    await kv.setNx("k", "otro", 60000);
    const r2 = await withLock(kv, "k", 60000, async () => "segundo");
    strict_1.default.equal(r2.locked, true);
    strict_1.default.equal(r2.result, undefined);
});
