"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.POST = POST;
const kv_js_1 = require("../../../../lib/kv.js");
const state_js_1 = require("../../../../lib/state.js");
const indicators_js_1 = require("../../../../lib/indicators.js");
const rng_js_1 = require("../../../../lib/rng.js");
const PAIRS = ["BTC", "ETH", "SOL", "XRP", "BNB", "DOGE", "ADA", "AVAX", "LINK"];
const TEMPLATES = [
    { style: "tendencia", tf: "1h", kind: "ema" },
    { style: "mean reversion", tf: "15m", kind: "rsi" },
    { style: "breakout", tf: "4h", kind: "donchian" },
    { style: "swing", tf: "1D", kind: "ema" },
    { style: "scalping", tf: "5m", kind: "rsi" },
];
async function POST(req) {
    const kv = (0, kv_js_1.getKv)();
    await (0, state_js_1.ensureSeed)(kv, new Date().toISOString());
    const { n = 3 } = await (0, kv_js_1.body)(req);
    const k = Math.min(10, Math.max(1, Number(n) || 3));
    const rnd = (0, rng_js_1.seedRand)(Date.now() % 2147483647);
    const out = [];
    const existing = await state_js_1.repo.strategies(kv);
    let idx = Object.keys(existing).length + 1;
    for (let i = 0; i < k; i++) {
        const t = TEMPLATES[Math.floor(rnd() * TEMPLATES.length)];
        const pair = PAIRS[Math.floor(rnd() * PAIRS.length)];
        const span = t.kind === "ema" ? 12 : t.kind === "rsi" ? 14 : 40;
        const base = t.kind === "ema" ? 5 : t.kind === "rsi" ? 7 : 15;
        const p1 = base + Math.floor(rnd() * span);
        const spec = { kind: t.kind, p1, pair };
        const closes = (0, indicators_js_1.genHistory)(pair);
        const backtest = (0, indicators_js_1.metrics)((0, indicators_js_1.runTrades)(spec, closes));
        const s = {
            id: `st-${idx++}`, name: `Minera ${t.kind.toUpperCase()} ${pair} ${t.tf} p${p1}`,
            pair, tf: t.tf, style: t.style, kind: t.kind, p1, status: "backtest",
            created_at: new Date().toISOString(), backtest,
        };
        if (backtest.trades < 10 || backtest.total <= 0 || backtest.sharpe < 0.2) {
            s.status = "descartada";
            s.discard = "backtest bajo umbral (trades>10, total>0, sharpe>0.2)";
        }
        else {
            const rob = (0, indicators_js_1.robustness)(spec, closes, rnd);
            s.robustness = rob;
            s.status = "robustez";
            if (!rob.pass) {
                s.status = "descartada";
                s.discard = `robustez ${rob.score}/4 insuficiente`;
            }
            else {
                s.status = "incubacion";
                s.live = { equity: 100, pnl: 0, ticks: 0, peak: 100, dd: 0, pos: null };
            }
        }
        await state_js_1.repo.saveStrategy(kv, s);
        out.push(s);
    }
    await state_js_1.repo.pushAudit(kv, { ts: new Date().toISOString(), ev: "incubator.mine", n: k });
    return (0, kv_js_1.json)(out);
}
