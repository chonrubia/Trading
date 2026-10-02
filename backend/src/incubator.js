// Incubadora Fase 6: minado → backtest → robustez → incubación paper → capital.
// Sin dependencias: histórico sintético + evaluadores + persistencia JSON.
const store = require("./store");

let strategies = store.load("incubator", []);
let n = strategies.length + 1;
const PAIRS = ["BTC", "ETH", "SOL", "XRP", "BNB", "DOGE", "ADA", "AVAX", "LINK"];
const TEMPLATES = [
  { style: "tendencia", tf: "1h", kind: "ema", pname: "fast/slow" },
  { style: "mean reversion", tf: "15m", kind: "rsi", pname: "periodo" },
  { style: "breakout", tf: "4h", kind: "donchian", pname: "ventana" },
  { style: "swing", tf: "1D", kind: "ema", pname: "fast/slow" },
  { style: "scalping", tf: "5m", kind: "rsi", pname: "periodo" },
];

function seedRand(seed) {
  let s = seed;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}
// histórico sintético con regímenes (tendencia + ruido) determinista por pair
function genHistory(pair, m = 500) {
  const rnd = seedRand([...pair].reduce((s, c) => s + c.charCodeAt(0) * 97, 13));
  const closes = [100];
  let trend = 0;
  for (let i = 1; i < m; i++) {
    if (i % 80 === 0) trend = (rnd() - 0.45) * 0.02;
    closes.push(closes[i - 1] * (1 + trend + (rnd() - 0.5) * 0.03));
  }
  return closes;
}
function ema(arr, p) {
  const k = 2 / (p + 1); let e = arr[0]; const out = [e];
  for (let i = 1; i < arr.length; i++) { e = arr[i] * k + e * (1 - k); out.push(e); }
  return out;
}
function rsi(arr, p = 14) {
  const out = new Array(arr.length).fill(50);
  let g = 0, l = 0;
  for (let i = 1; i < arr.length; i++) {
    const d = arr[i] - arr[i - 1];
    g = (g * (p - 1) + Math.max(d, 0)) / p; l = (l * (p - 1) + Math.max(-d, 0)) / p;
    out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  }
  return out;
}
// evalúa estrategia sobre closes → trades [{pnl}] con costes taker+spread realistas
function runTrades(spec, closes, fee = 0.0026) {
  const trades = [];
  let pos = null; // {side, entry, i}
  const HOLD = spec.kind === "rsi" ? 6 : spec.kind === "donchian" ? 10 : 12;
  const eFast = spec.kind === "ema" ? ema(closes, spec.p1) : null;
  const eSlow = spec.kind === "ema" ? ema(closes, spec.p1 * 3) : null;
  const r = spec.kind === "rsi" ? rsi(closes, spec.p1) : null;
  for (let i = 30; i < closes.length; i++) {
    let sig = 0;
    if (spec.kind === "ema") sig = eFast[i] > eSlow[i] ? 1 : -1;
    else if (spec.kind === "rsi") sig = r[i] < 30 ? 1 : r[i] > 70 ? -1 : 0;
    else { const w = closes.slice(i - spec.p1, i); sig = closes[i] >= Math.max(...w) ? 1 : closes[i] <= Math.min(...w) ? -1 : 0; }
    if (!pos && sig !== 0) pos = { side: sig, entry: closes[i], i };
    else if (pos && (i - pos.i >= HOLD || sig === -pos.side)) {
      const chg = (closes[i] - pos.entry) / pos.entry;
      trades.push({ pnl: (chg * pos.side - fee) * 1000 });
      pos = sig !== 0 && sig !== pos.side ? { side: sig, entry: closes[i], i } : (i - pos.i >= HOLD ? null : pos);
      if (pos && sig !== 0 && i - pos.i >= HOLD) pos = null;
    }
  }
  return trades;
}
function metrics(trades) {
  if (!trades.length) return { trades: 0, total: 0, win: 0, pf: 0, dd: 100, sharpe: -9 };
  const pnls = trades.map(t => t.pnl);
  const total = pnls.reduce((s, x) => s + x, 0);
  const wins = pnls.filter(x => x > 0);
  const win = wins.length / pnls.length * 100;
  const gp = wins.reduce((s, x) => s + x, 0), gl = Math.abs(pnls.filter(x => x <= 0).reduce((s, x) => s + x, 0));
  // max drawdown sobre curva
  let eq = 0, peak = 0, dd = 0;
  pnls.forEach(p => { eq += p; peak = Math.max(peak, eq); dd = Math.max(dd, peak - eq); });
  const mean = total / pnls.length;
  const sd = Math.sqrt(pnls.reduce((s, x) => s + (x - mean) ** 2, 0) / pnls.length) || 1;
  return { trades: trades.length, total: Math.round(total * 10) / 10, win: Math.round(win * 10) / 10, pf: Math.round((gp / (gl || 1)) * 100) / 100, dd: Math.round(dd * 10) / 10, sharpe: Math.round((mean / sd) * Math.sqrt(252) * 100) / 100 };
}
function robustness(spec, closes) {
  const thirds = [closes.slice(0, 170), closes.slice(170, 340), closes.slice(340)];
  // OJO: slices cortos; se evalúa con mismo runTrades (warmup interno de 30 barras)
  const folds = thirds.map(c => metrics(runTrades(spec, c)).total > 0);
  const oos = metrics(runTrades(spec, closes.slice(400))).total > 0;
  const base = runTrades(spec, closes).map(t => t.pnl);
  let mcWin = 0; const R = 120;
  for (let k = 0; k < R; k++) {
    let s = 0; const sh = [...base];
    for (let i = sh.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[sh[i], sh[j]] = [sh[j], sh[i]]; }
    sh.forEach(x => s += x);
    if (s > 0) mcWin++;
  }
  const alt = { ...spec, p1: Math.max(2, Math.round(spec.p1 * 1.1)) };
  const sens = metrics(runTrades(alt, closes)).total > 0;
  const score = (folds.filter(Boolean).length >= 2 ? 1 : 0) + (oos ? 1 : 0) + (mcWin / R > 0.6 ? 1 : 0) + (sens ? 1 : 0);
  return { folds, oos, mc: Math.round(mcWin / R * 100), sens, score, pass: score >= 3 };
}

function mineOne() {
  const t = TEMPLATES[Math.floor(Math.random() * TEMPLATES.length)];
  const pair = PAIRS[Math.floor(Math.random() * PAIRS.length)];
  const p1 = t.kind === "ema" ? 5 + Math.floor(Math.random() * 12) : t.kind === "rsi" ? 7 + Math.floor(Math.random() * 14) : 15 + Math.floor(Math.random() * 40);
  const s = { id: `st-${n++}`, name: `Minera ${t.kind.toUpperCase()} ${pair} ${t.tf} p${p1}`, pair, tf: t.tf, style: t.style, kind: t.kind, p1, status: "minada", created_at: new Date().toISOString() };
  strategies.unshift(s); if (strategies.length > 60) strategies.length = 60;
  persist();
  return qualify(s);
}
function qualify(s) {
  const closes = genHistory(s.pair);
  s.backtest = metrics(runTrades(s, closes));
  s.status = "backtest";
  if (s.backtest.trades < 10 || s.backtest.total <= 0 || s.backtest.sharpe < 0.2) { s.status = "descartada"; s.discard = "backtest bajo umbral (trades>10, total>0, sharpe>0.2)"; persist(); return s; }
  s.robustness = robustness(s, closes);
  s.status = "robustez";
  if (!s.robustness.pass) { s.status = "descartada"; s.discard = `robustez ${s.robustness.score}/4 insuficiente`; persist(); return s; }
  s.status = "incubacion";
  s.live = { equity: 100, pnl: 0, ticks: 0, peak: 100, dd: 0, pos: null };
  persist();
  return s;
}
// paper live por tick: señal sobre buffer de cierres reales
function updateLive(buffers) {
  strategies.filter(s => s.status === "incubacion").forEach(s => {
    const buf = buffers[s.pair] || [];
    if (buf.length < 40 || s.live.pos === undefined) return;
    s.live.ticks++;
    const closes = buf.slice(-60);
    const sig = liveSignal(s, closes);
    const px = buf[buf.length - 1];
    const L = s.live;
    if (!L.pos && sig !== 0) L.pos = { side: sig, entry: px };
    else if (L.pos) {
      const chg = (px - L.pos.entry) / L.pos.entry;
      const upnl = chg * L.pos.side * 1000;
      const close = chg * L.pos.side > 0.015 || chg * L.pos.side < -0.008 || L.ticks % 8 === 0;
      if (close) {
        L.pnl = Math.round((L.pnl + upnl - 0.5) * 10) / 10;
        L.equity = Math.round((100 + L.pnl) * 10) / 10;
        L.peak = Math.max(L.peak, L.equity);
        L.dd = Math.round((L.peak - L.equity) / L.peak * 10000) / 100;
        L.pos = sig !== 0 ? { side: sig, entry: px } : null;
      }
    }
    if (L.ticks >= 50 && L.pnl > 4 && L.dd < 6) { s.status = "lista"; }
    else if (L.ticks >= 100 && L.pnl <= 0) { s.status = "descartada"; s.discard = `incubación paper ${L.pnl}€ en ${L.ticks} ticks`; }
  });
  persist();
}
function liveSignal(s, closes) {
  const i = closes.length - 1;
  if (s.kind === "ema") { const f = ema(closes, s.p1), sl = ema(closes, s.p1 * 3); return f[i] > sl[i] ? 1 : -1; }
  if (s.kind === "rsi") { const r = rsi(closes, s.p1); return r[i] < 32 ? 1 : r[i] > 68 ? -1 : 0; }
  const w = closes.slice(Math.max(0, i - s.p1), i);
  if (!w.length) return 0;
  return closes[i] >= Math.max(...w) ? 1 : closes[i] <= Math.min(...w) ? -1 : 0;
}
function persist() { store.save("incubator", strategies.slice(0, 60)); }
function list() { return strategies; }
function stats() {
  const c = {};
  strategies.forEach(s => c[s.status] = (c[s.status] || 0) + 1);
  return { ...c, total: strategies.length, activas: c.activa || 0, incubacion: c.incubacion || 0, lista: c.lista || 0 };
}
module.exports = { mineOne, qualify, updateLive, list, stats, persist, get: (id) => strategies.find(s => s.id === id) };
// Exportadas para tests de caracterización (F0) y port a lib/ (F1). Sin efectos.
module.exports._pure = { seedRand, genHistory, ema, rsi, runTrades, metrics, liveSignal };
