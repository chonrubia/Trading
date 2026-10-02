"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.genHistory = genHistory;
exports.ema = ema;
exports.rsi = rsi;
exports.runTrades = runTrades;
exports.metrics = metrics;
exports.liveSignal = liveSignal;
exports.robustness = robustness;
exports.qualify = qualify;
// Indicadores y backtest. Port exacto de las funciones puras de backend/src/incubator.js.
// robustness/mine reciben rng inyectado (antes Math.random). Sin I/O ni fechas.
const rng_js_1 = require("./rng.js");
function genHistory(pair, m = 500) {
    const rnd = (0, rng_js_1.seedRand)([...pair].reduce((s, c) => s + c.charCodeAt(0) * 97, 13));
    const closes = [100];
    let trend = 0;
    for (let i = 1; i < m; i++) {
        if (i % 80 === 0)
            trend = (rnd() - 0.45) * 0.02;
        closes.push(closes[i - 1] * (1 + trend + (rnd() - 0.5) * 0.03));
    }
    return closes;
}
function ema(arr, p) {
    const k = 2 / (p + 1);
    let e = arr[0];
    const out = [e];
    for (let i = 1; i < arr.length; i++) {
        e = arr[i] * k + e * (1 - k);
        out.push(e);
    }
    return out;
}
function rsi(arr, p = 14) {
    const out = new Array(arr.length).fill(50);
    let g = 0, l = 0;
    for (let i = 1; i < arr.length; i++) {
        const d = arr[i] - arr[i - 1];
        g = (g * (p - 1) + Math.max(d, 0)) / p;
        l = (l * (p - 1) + Math.max(-d, 0)) / p;
        out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
    }
    return out;
}
function runTrades(spec, closes, fee = 0.0026) {
    const trades = [];
    let pos = null;
    const HOLD = spec.kind === "rsi" ? 6 : spec.kind === "donchian" ? 10 : 12;
    const eFast = spec.kind === "ema" ? ema(closes, spec.p1) : null;
    const eSlow = spec.kind === "ema" ? ema(closes, spec.p1 * 3) : null;
    const r = spec.kind === "rsi" ? rsi(closes, spec.p1) : null;
    for (let i = 30; i < closes.length; i++) {
        let sig = 0;
        if (spec.kind === "ema")
            sig = eFast[i] > eSlow[i] ? 1 : -1;
        else if (spec.kind === "rsi")
            sig = r[i] < 30 ? 1 : r[i] > 70 ? -1 : 0;
        else {
            const w = closes.slice(i - spec.p1, i);
            sig = closes[i] >= Math.max(...w) ? 1 : closes[i] <= Math.min(...w) ? -1 : 0;
        }
        if (!pos && sig !== 0)
            pos = { side: sig, entry: closes[i], i };
        else if (pos && (i - pos.i >= HOLD || sig === -pos.side)) {
            const chg = (closes[i] - pos.entry) / pos.entry;
            trades.push({ pnl: (chg * pos.side - fee) * 1000 });
            pos = sig !== 0 && sig !== pos.side ? { side: sig, entry: closes[i], i } : (i - pos.i >= HOLD ? null : pos);
            if (pos && sig !== 0 && i - pos.i >= HOLD)
                pos = null;
        }
    }
    return trades;
}
function metrics(trades) {
    if (!trades.length)
        return { trades: 0, total: 0, win: 0, pf: 0, dd: 100, sharpe: -9 };
    const pnls = trades.map(t => t.pnl);
    const total = pnls.reduce((s, x) => s + x, 0);
    const wins = pnls.filter(x => x > 0);
    const win = wins.length / pnls.length * 100;
    const gp = wins.reduce((s, x) => s + x, 0), gl = Math.abs(pnls.filter(x => x <= 0).reduce((s, x) => s + x, 0));
    let eq = 0, peak = 0, dd = 0;
    pnls.forEach(p => { eq += p; peak = Math.max(peak, eq); dd = Math.max(dd, peak - eq); });
    const mean = total / pnls.length;
    const sd = Math.sqrt(pnls.reduce((s, x) => s + (x - mean) ** 2, 0) / pnls.length) || 1;
    return { trades: trades.length, total: Math.round(total * 10) / 10, win: Math.round(win * 10) / 10, pf: Math.round((gp / (gl || 1)) * 100) / 100, dd: Math.round(dd * 10) / 10, sharpe: Math.round((mean / sd) * Math.sqrt(252) * 100) / 100 };
}
function liveSignal(s, closes) {
    const i = closes.length - 1;
    if (s.kind === "ema") {
        const f = ema(closes, s.p1), sl = ema(closes, s.p1 * 3);
        return f[i] > sl[i] ? 1 : -1;
    }
    if (s.kind === "rsi") {
        const r = rsi(closes, s.p1);
        return r[i] < 32 ? 1 : r[i] > 68 ? -1 : 0;
    }
    const w = closes.slice(Math.max(0, i - s.p1), i);
    if (!w.length)
        return 0;
    return closes[i] >= Math.max(...w) ? 1 : closes[i] <= Math.min(...w) ? -1 : 0;
}
function robustness(spec, closes, rnd) {
    const thirds = [closes.slice(0, 170), closes.slice(170, 340), closes.slice(340)];
    const folds = thirds.map(c => metrics(runTrades(spec, c)).total > 0);
    const oos = metrics(runTrades(spec, closes.slice(400))).total > 0;
    const base = runTrades(spec, closes).map(t => t.pnl);
    let mcWin = 0;
    const R = 120;
    for (let k = 0; k < R; k++) {
        let s = 0;
        const sh = [...base];
        for (let i = sh.length - 1; i > 0; i--) {
            const j = Math.floor(rnd() * (i + 1));
            [sh[i], sh[j]] = [sh[j], sh[i]];
        }
        sh.forEach(x => s += x);
        if (s > 0)
            mcWin++;
    }
    const alt = { ...spec, p1: Math.max(2, Math.round(spec.p1 * 1.1)) };
    const sens = metrics(runTrades(alt, closes)).total > 0;
    const score = (folds.filter(Boolean).length >= 2 ? 1 : 0) + (oos ? 1 : 0) + (mcWin / R > 0.6 ? 1 : 0) + (sens ? 1 : 0);
    return { folds, oos, mc: Math.round(mcWin / R * 100), sens, score, pass: score >= 3 };
}
function qualify(spec) {
    const closes = genHistory(spec.pair);
    const backtest = metrics(runTrades(spec, closes));
    if (backtest.trades < 10 || backtest.total <= 0 || backtest.sharpe < 0.2) {
        return { status: "descartada", backtest, discard: "backtest bajo umbral (trades>10, total>0, sharpe>0.2)" };
    }
    // NOTE: robustness con rng inyectado se evalúa en el caller (F3); aquí solo backtest.
    return { status: "incubacion", backtest };
}
