const express = require("express");
const cors = require("cors");
const http = require("http");
const { WebSocketServer } = require("ws");
const { buildState } = require("./seed");
const market = require("./market");
const risk = require("./risk");
const store = require("./store");
const memory = require("./memory");
const school = require("./school");
const incubator = require("./incubator");
const desks = require("./desks");
const costs = require("./costs");
const target = require("./target");
const priceBuffers = {}; // pair -> últimos cierres live para incubación
let venuesCache = {};

const PORT = Number(process.env.PORT) || 8765;
const app = express();
app.use(cors());
app.use(express.json());

const state = buildState();
state.operations = store.load("operations", []);
state.meetings = store.load("meetings", []);
const savedMsgs = store.load("messages", []);
if (savedMsgs.length) state.messages = savedMsgs.slice(-300);
const savedAgents = store.load("agents_pnl", null);
if (savedAgents) {
  const m = new Map(savedAgents.map(a => [a.id, a]));
  state.agents.forEach(a => {
    const s = m.get(a.id);
    if (s) { a.pnl = s.pnl; a.trades_count = s.trades_count; a.level_risk = s.level_risk; a.level_ta = s.level_ta; }
  });
} else {
  // arranque limpio: sin PnL heredado del seed
  state.agents.forEach(a => { a.pnl = 0; a.trades_count = 0; });
}
// agentes incubados que recibieron capital (no están en el seed)
store.load("extra_agents", []).forEach(a => { if (!state.agents.find(x => x.id === a.id)) state.agents.push(a); });
state.snapshots = store.load("snapshots", []);
const startedAt = new Date().toISOString();
let lastError = null;
let equity = 500;
let peakEquity = 500;
let dayPnl = 0;
const FUND_BASE = 500;
let dayStartEquity = store.load("day_start", null) ?? FUND_BASE;
let drawdown = 0;
let lastTick = market.snapshot();
let msgN = 100 + state.messages.length;
let opN = 1 + state.operations.length;
let tickN = 0;
function trimOps() {
  // conserva historial de cerradas (aprenden de él) y recorta el resto
  const closed = state.operations.filter(o => o.status === "cerrada").slice(-250);
  const rest = state.operations.filter(o => o.status !== "cerrada").slice(-80);
  state.operations = closed.concat(rest);
}
function persist() {
  store.save("operations", state.operations.slice(-300));
  store.save("meetings", state.meetings.slice(0, 20));
  store.save("messages", state.messages.slice(-300));
  store.save("agents_pnl", state.agents.map(a => ({ id: a.id, pnl: a.pnl, trades_count: a.trades_count, level_risk: a.level_risk, level_ta: a.level_ta })));
  store.save("extra_agents", state.agents.filter(a => a.incubated));
  store.save("snapshots", state.snapshots.slice(-20000));
  store.save("day_start", dayStartEquity);
}
// endurecimiento: no morir ante un tick raro; dejar rastro
process.on("uncaughtException", e => { lastError = String(e && e.stack || e); try { require("fs").appendFileSync(require("path").join(__dirname, "..", "data", "run.log"), `${new Date().toISOString()} UNCAUGHT ${lastError}\n`); } catch {} persist(); });
process.on("unhandledRejection", e => { lastError = String(e); try { require("fs").appendFileSync(require("path").join(__dirname, "..", "data", "run.log"), `${new Date().toISOString()} REJECTED ${lastError}\n`); } catch {} });
process.on("SIGINT", () => { persist(); process.exit(0); });
process.on("SIGTERM", () => { persist(); process.exit(0); });

const committee = { active: false, topic: "", started_at: null, ticks: 0, backup: new Map(), log: [] };
let today = target.dayKey();
const tradesToday = {}; // agent_id -> n (tope diario anti-frenesí)
const lastPnl = {};     // agent_id -> último resultado (anti-tilt)
let targetAnnounced = false; // aviso de objetivo batido (una vez al día)
let riskHalted = false;     // aviso de freno de Riesgos (una vez al día)

const IDEAS = [
  "Sin posición en {P}. Esperando que {S} dé señal.",
  "Nota de análisis {P}: sesgo muy alcista. Sobre la media de 50 días.",
  "Funding en {P} 0.010% — sin prisa por forzar.",
  "RSI({P}) sobrecomprado en 1h. Mejor esperar retroceso.",
  "Breakout en {P} con volumen. Vigilo confirmación.",
  "Nada que hacer en {P} por ahora. Mejor no forzar.",
  "Listo, otra vez al lío.",
  "Café y vuelvo a la pantalla.",
];
function agentMsg(a) {
  const t = IDEAS[Math.floor(Math.random() * IDEAS.length)];
  return t.replace("{P}", a.pair).replace("{S}", a.strategy.split(" ")[0]);
}
function ctxRisk() {
  return { equity, dayPnl, drawdown, openOps: state.operations, prices: lastTick.prices };
}

// ---- REST Fase1 ----
app.get("/api/health", (_, res) => res.json({ ok: true, agents: state.agents.length, mode: "paper", fase: 7.3, uptime_min: Math.round((Date.now() - Date.parse(startedAt)) / 60000), ticks: tickN, snapshots: state.snapshots.length, lastError, ts: new Date().toISOString() }));

// ---- Objetivo diario + expectancy por setup ----
app.get("/api/target", (_, res) => {
  const h = target.hits();
  const hist = Object.entries(h).map(([day, v]) => ({ day, ...v })).sort((a, b) => a.day < b.day ? 1 : -1).slice(0, 14);
  res.json({ target: target.DAILY_TARGET, today, dayPnl: Math.round(dayPnl * 100) / 100, progress: Math.round(dayPnl / target.DAILY_TARGET * 1000) / 10 + "%", hit: dayPnl >= target.DAILY_TARGET, history: hist, hits: hist.filter(d => d.hit).length });
});
app.get("/api/setups", (_, res) => res.json(target.setupStats(state.operations.filter(o => o.status === "cerrada")).slice(0, 20)));
app.get("/api/portfolio", (_, res) => res.json({
  patrimonio: Math.round(equity * 100) / 100, resultado_hoy: Math.round(dayPnl * 100) / 100,
  caida: drawdown, exposicion_bruta: risk.fundExposure(state.operations, equity),
  posiciones: state.operations.filter(o => o.status === "abierta").length,
  costes_pagados: Math.round(state.operations.filter(o => o.status === "cerrada").reduce((s, o) => s + (o.fees || 0), 0) * 100) / 100,
  freno_riesgos: dayPnl <= risk.FUND_LIMITS.max_day_loss,
  objetivo: target.DAILY_TARGET, progreso: Math.round(dayPnl / target.DAILY_TARGET * 1000) / 10 + "%",
  mode: "PAPEL realista · sin dinero demo",
  kill: risk.isKilled(),
}));
app.get("/api/market", (_, res) => res.json(lastTick));
app.get("/api/departments", (_, res) => {
  const counts = {};
  state.agents.forEach(a => counts[a.department_id] = (counts[a.department_id] || 0) + 1);
  const exp = risk.fundExposure(state.operations, equity);
  res.json(state.departments.map(d => ({
    ...d, headcount: counts[d.id] || 0,
    riesgos: { exposicion_bruta: `${exp}% / ${risk.FUND_LIMITS.max_exposure_gross}%`, exposicion_neta: `${exp}%`, caida_max: `${drawdown}%`, resultado_dia: `${Math.round(dayPnl)}€ (límite ${risk.FUND_LIMITS.max_day_loss}€)`, estado: risk.isKilled() ? "DETENIDO" : committee.active ? "COMITÉ" : "Normal" },
  })));
});
app.get("/api/agents", (req, res) => {
  const { dept, q, limit } = req.query;
  let list = state.agents;
  if (dept) list = list.filter(a => a.department_id === dept);
  if (q) list = list.filter(a => (a.name + a.strategy + a.pair).toLowerCase().includes(String(q).toLowerCase()));
  res.json(list.slice(0, Number(limit) || 200));
});
app.get("/api/agents/:id", (req, res) => {
  const a = state.agents.find(x => x.id === req.params.id);
  if (!a) return res.status(404).json({ error: "not found" });
  res.json({ ...a, suspended: risk.suspended.has(a.id), history: state.messages.filter(m => m.from_agent_id === a.id).slice(-10), ops: state.operations.filter(o => o.agent_id === a.id).slice(-10), school: school.forAgent(a.id, 8) });
});
app.get("/api/ranking", (req, res) => {
  const sorted = [...state.agents].filter(a => a.role === "Trader").sort((x, y) => y.pnl - x.pnl);
  res.json(sorted.slice(0, 50).map((a, i) => ({ rank: i + 1, id: a.id, name: a.name, setup: a.strategy, pair: a.pair, pnl: a.pnl, hoy: a.pnl, win_rate: a.win_rate, suspended: risk.suspended.has(a.id) })));
});
app.get("/api/channels", (_, res) => res.json(state.channels));
app.get("/api/channels/:id/messages", (req, res) => {
  res.json(state.messages.filter(m => m.channel_id === req.params.id).slice(-50).map(m => ({ ...m, from: state.agents.find(a => a.id === m.from_agent_id)?.name || "Tú" })));
});
app.post("/api/chat", (req, res) => {
  const { channel_id = "c-general", text, to_agent_id = null } = req.body || {};
  if (!text) return res.status(400).json({ error: "text requerido" });
  const msg = { id: `m-u-${Date.now()}`, channel_id, from_agent_id: null, to_agent_id, text, kind: "humano", created_at: new Date().toISOString() };
  state.messages.push(msg);
  broadcast({ type: "chat", msg: { ...msg, from: "Tú" } });
  const target = state.agents.find(a => a.id === to_agent_id) || state.agents[Math.floor(Math.random() * state.agents.length)];
  setTimeout(() => {
    const reply = { id: `m-${msgN++}`, channel_id, from_agent_id: target.id, text: `Recibido. Lo reviso con ${target.strategy} en ${target.pair} (${target.timeframe}). ${target.last_reason}`, kind: "respuesta", created_at: new Date().toISOString() };
    state.messages.push(reply);
    broadcast({ type: "chat", msg: { ...reply, from: target.name } });
  }, 800);
  res.json(msg);
});

// ---- Fase2: riesgos + operaciones + comité ----
app.get("/api/risk", (_, res) => res.json({
  limits: risk.FUND_LIMITS, kill: risk.isKilled(), exposure: risk.fundExposure(state.operations, equity),
  dayPnl: Math.round(dayPnl * 100) / 100, drawdown, open: state.operations.filter(o => o.status === "abierta").length,
  blocked: state.operations.filter(o => o.status === "bloqueada").length, suspended: [...risk.suspended],
}));
app.post("/api/risk/kill", (req, res) => {
  risk.setKill(!!req.body?.active);
  store.audit({ ev: "risk.kill", active: !!req.body?.active });
  const m = { id: `m-${msgN++}`, channel_id: "c-general", from_agent_id: state.agents[1].id, text: req.body?.active ? "Riesgos: KILL-SWITCH activado por humano. Trading detenido." : "Riesgos: kill-switch liberado. Reanudo paper.", kind: "alerta", created_at: new Date().toISOString() };
  state.messages.push(m);
  broadcast({ type: "chat", msg: { ...m, from: state.agents[1].name } });
  broadcast({ type: "risk", kill: risk.isKilled() });
  res.json({ kill: risk.isKilled() });
});
app.post("/api/risk/suspend", (req, res) => {
  const { agent_id, active } = req.body || {};
  if (active) risk.suspended.add(agent_id); else risk.suspended.delete(agent_id);
  store.audit({ ev: "risk.suspend", agent_id, active: !!active });
  res.json({ suspended: [...risk.suspended] });
});
app.get("/api/operations", (req, res) => {
  const { status, limit, desk } = req.query;
  let l = [...state.operations].reverse();
  if (status) l = l.filter(o => o.status === status);
  if (desk) l = l.filter(o => (o.desk || "spot") === desk);
  res.json(l.slice(0, Number(limit) || 50));
});
app.post("/api/operations/propose", (req, res) => {
  const { agent_id, pair, side = "LONG", size, leverage } = req.body || {};
  const agent = state.agents.find(a => a.id === agent_id) || state.agents.filter(a => a.role === "Trader")[0];
  const px = lastTick.prices[pair || agent.pair];
  const useSize = size || Math.round(20 / px * 10000) / 10000; // defecto: 20€ nocional
  const prop = { pair: pair || agent.pair, side, entry: px, size: useSize, leverage: leverage || agent.leverage };
  const verdict = risk.checkOperation(agent, prop, ctxRisk());
  const op = {
    id: `op-${opN++}`, agent_id: agent.id, agent_name: agent.name, strategy: agent.strategy, ...prop,
    size: verdict.size || prop.size, leverage: verdict.leverage || prop.leverage,
    status: verdict.approved ? "abierta" : "bloqueada", pnl: 0, life: 0,
    maxLife: 3 + Math.floor(Math.random() * 6), risk_note: verdict.reason,
    estCosts: costs.estOpen(verdict.size || prop.size, px, prop.pair, "spot"),
    opened_at: new Date().toISOString(),
  };
  state.operations.push(op);
  trimOps();
  store.audit({ ev: "op.propose", id: op.id, agent: agent.id, pair: op.pair, side: op.side, status: op.status, note: op.risk_note });
  broadcast({ type: "operation", op });
  res.json(op);
});

function committeeSummary() {
  const top = [...state.agents].filter(a => a.role === "Trader").sort((a, b) => b.pnl - a.pnl).slice(0, 3);
  return {
    topic: committee.topic, ended_at: new Date().toISOString(),
    patrimonio: Math.round(equity), dayPnl: Math.round(dayPnl * 100) / 100,
    exposure: risk.fundExposure(state.operations, equity),
    top3: top.map(t => ({ name: t.name, setup: t.strategy, pnl: Math.round(t.pnl * 100) / 100 })),
    decisions: [
      `Capital protegido: exposición ${risk.fundExposure(state.operations, equity)}% dentro de límite`,
      `Refuerzo a ${top[0]?.name} (${top[0]?.strategy}) por liderar ranking`,
      committee.ticks >= 8 ? "Consenso macro RISK-ON: mantener operativa" : "Comité breve: mantener operativa con prudencia",
    ],
    messages: committee.log.length,
  };
}
app.post("/api/committee/start", (req, res) => {
  if (committee.active) return res.json({ active: true });
  committee.active = true; committee.ticks = 0; committee.log = [];
  committee.topic = req.body?.topic || "Reunión de comité: revisión de riesgos y ranking";
  committee.started_at = new Date().toISOString();
  committee.backup = new Map(state.agents.map(a => [a.id, { x: a.x, y: a.y }]));
  // mover a sala (0.5, 0.88) con jitter
  state.agents.forEach((a, i) => { a.tx = 0.5 + ((i % 14) - 7) * 0.022; a.ty = 0.86 + (Math.floor(i / 14) % 4) * 0.03; a.status = "hablando"; });
  const m = { id: `m-${msgN++}`, channel_id: "c-general", from_agent_id: state.agents[0].id, text: `Comité convocado: ${committee.topic}. Toda la oficina a la sala.`, kind: "alerta", created_at: new Date().toISOString() };
  state.messages.push(m);
  broadcast({ type: "committee", phase: "started", topic: committee.topic });
  broadcast({ type: "chat", msg: { ...m, from: state.agents[0].name } });
  res.json({ active: true, topic: committee.topic });
});
function endCommittee(auto = false) {
  if (!committee.active) return null;
  committee.active = false;
  committee.backup.forEach((p, id) => { const a = state.agents.find(x => x.id === id); if (a) { a.tx = p.x; a.ty = p.y; a.status = "analizando"; } });
  const summary = committeeSummary();
  state.meetings.unshift({ id: `meet-${Date.now()}`, ...summary, auto });
  memory.add({ author: "Dirección CIO", dept: "direccion", pair: "FONDO", text: `Comité: ${summary.decisions.join(" · ")}`, kind: "comite" });
  // mentoring: top1 comparte con el peor
  const ranked = [...state.agents].filter(a => a.role === "Trader").sort((a, b) => b.pnl - a.pnl);
  const best = ranked[0], worst = ranked[ranked.length - 1];
  if (best && worst && best.id !== worst.id) {
    school.award(worst.id, "tecnico", 12, `Mentoring de ${best.name}: comparte ${best.strategy}`);
    const mm = { id: `m-${msgN++}`, channel_id: "c-general", from_agent_id: best.id, text: `Mentoring para ${worst.name}: mi ${best.strategy} en ${best.pair} funciona si respetas el stop. ${memory.cite()}`, kind: "mentoring", created_at: new Date().toISOString() };
    state.messages.push(mm); broadcast({ type: "chat", msg: { ...mm, from: best.name } });
  }
  store.audit({ ev: "committee.end", topic: summary.topic, auto, top: summary.top3.map(t => t.name) });
  persist();
  const m = { id: `m-${msgN++}`, channel_id: "c-general", from_agent_id: state.agents[0].id, text: `Comité cerrado. Conclusiones: ${summary.decisions.join(" · ")}`, kind: "alerta", created_at: new Date().toISOString() };
  state.messages.push(m);
  broadcast({ type: "committee", phase: "ended", summary });
  broadcast({ type: "chat", msg: { ...m, from: state.agents[0].name } });
  return summary;
}
app.post("/api/committee/end", (_, res) => res.json(endCommittee(false) || { active: false }));
app.get("/api/meetings", (_, res) => res.json(state.meetings.slice(0, 10)));
app.get("/api/committee", (_, res) => res.json({ active: committee.active, topic: committee.topic, ticks: committee.ticks }));

// ---- Fase3: memoria compartida + escuela + auditoría ----
app.get("/api/memory", (req, res) => {
  const { q, limit } = req.query;
  res.json(q ? memory.search(q, Number(limit) || 10) : memory.list(Number(limit) || 30));
});
app.post("/api/memory", (req, res) => {
  const { author = "Tú (humano)", dept = "direccion", pair = "BTC", text, kind = "nota" } = req.body || {};
  if (!text) return res.status(400).json({ error: "text requerido" });
  const e = memory.add({ author, dept, pair, text, kind });
  store.audit({ ev: "memory.add", ...e });
  broadcast({ type: "memory", entry: e });
  res.json(e);
});
app.get("/api/school/leaderboard", (_, res) => res.json(school.leaderboard(state.agents, 12)));
app.get("/api/school/agent/:id", (req, res) => res.json(school.forAgent(req.params.id, 20)));
app.get("/api/audit", (req, res) => res.json(store.tailAudit(Number(req.query.limit) || 50)));

// ---- Fase7: mesas (arbitraje, derivados, coberturas) ----
app.get("/api/desks", (_, res) => {
  const open = s => state.operations.filter(o => o.status === "abierta" && (o.desk || "spot") === s);
  const spreads = Object.entries(venuesCache).map(([pair, v]) => ({ pair, a: v.a, b: v.b, spread: Math.round(desks.spreadOf(v) * 1000) / 1000 })).sort((a, b) => b.spread - a.spread);
  res.json({
    venues: spreads.slice(0, 12), funding: lastTick.funding,
    arbOpen: open("arbitraje"), derivadosOpen: open("derivados"), hedge: open("cobertura")[0] || null,
    signal: desks.hedgeSignal(risk.fundExposure(state.operations, equity), drawdown),
    pnl: desks.deskPnl(state.operations),
  });
});

// ---- Informe paper: consistencia, eficacia de Riesgos, costes ----
app.get("/api/report", (_, res) => {
  const closed = state.operations.filter(o => o.status === "cerrada");
  const blocked = state.operations.filter(o => o.status === "bloqueada");
  const net = closed.reduce((s, o) => s + (o.pnl || 0), 0);
  const fees = closed.reduce((s, o) => s + (o.fees || 0), 0);
  const wins = closed.filter(o => o.pnl > 0);
  const gp = wins.reduce((s, o) => s + o.pnl, 0);
  const gl = Math.abs(closed.filter(o => o.pnl <= 0).reduce((s, o) => s + o.pnl, 0));
  // días desde snapshots (equity primero→último por día)
  const byDay = {};
  state.snapshots.forEach(s => { const d = s.ts.slice(0, 10); (byDay[d] = byDay[d] || []).push(s.equity); });
  const days = Object.entries(byDay).map(([d, eq]) => ({ day: d, pnl: Math.round((eq[eq.length - 1] - eq[0]) * 100) / 100 }));
  const green = days.filter(d => d.pnl > 0).length;
  // sharpe sobre retornos de snapshots (1 snap ≈ 60s → 1440/día)
  const rets = state.snapshots.slice(1).map((s, i) => (s.equity - state.snapshots[i].equity) / state.snapshots[i].equity);
  const m = rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : 0;
  const sd = rets.length > 1 ? Math.sqrt(rets.reduce((a, b) => a + (b - m) ** 2, 0) / rets.length) : 0;
  const sharpe = sd ? Math.round(m / sd * Math.sqrt(1440) * 100) / 100 : 0;
  const reasons = {};
  blocked.forEach(o => { const k = (o.risk_note || "?").slice(0, 60); reasons[k] = (reasons[k] || 0) + 1; });
  const deskNet = {};
  closed.forEach(o => { const k = o.desk || "spot"; deskNet[k] = Math.round(((deskNet[k] || 0) + o.pnl) * 100) / 100; });
  const approved = closed.length + state.operations.filter(o => o.status === "abierta").length;
  const verdict = days.length < 5 ? "muestra insuficiente (faltan días)"
    : sharpe > 1 && green / days.length >= 0.55 && (gp / (gl || 1)) > 1.2 ? "consistente (provisional)"
    : "no consistente: probablemente suerte o régimen favorable";
  res.json({
    generated_at: new Date().toISOString(), costs_cfg: { spot_taker: costs.SPOT_TAKER, fut_taker: costs.FUT_TAKER, slip: costs.SLIP, spreads: "0.01-0.05% por par", nota: "todo taker a mercado" },
    trades: { closed: closed.length, open: state.operations.filter(o => o.status === "abierta").length, blocked: blocked.length, block_rate: (approved + blocked.length) ? Math.round(blocked.length / (approved + blocked.length) * 1000) / 10 + "%" : "0%" },
    net: Math.round(net * 100) / 100, fees_paid: Math.round(fees * 100) / 100,
    costs_drag: gp ? Math.round(fees / gp * 1000) / 10 + "% de las ganancias brutas" : "-",
    win_rate: closed.length ? Math.round(wins.length / closed.length * 1000) / 10 + "%" : "-",
    profit_factor: Math.round(gp / (gl || 1) * 100) / 100, sharpe,
    days: days.length, green_days: `${green}/${days.length}`, by_day: days.slice(-14),
    desk_net: deskNet, block_reasons: reasons,
    audit_tail: store.tailAudit(5).map(a => a.ev),
    verdict,
  });
});

// ---- Fase6: incubadora ----
app.get("/api/incubator", (_, res) => res.json(incubator.list().slice(0, 60)));
app.get("/api/incubator/stats", (_, res) => res.json(incubator.stats()));
app.post("/api/incubator/mine", (req, res) => {
  const k = Math.min(10, Math.max(1, Number(req.body?.n) || 3));
  const out = [];
  for (let i = 0; i < k; i++) out.push(incubator.mineOne());
  store.audit({ ev: "incubator.mine", n: k, into_incubation: out.filter(s => s.status === "incubacion").length });
  broadcast({ type: "incubator", stats: incubator.stats() });
  res.json(out);
});
function promoteStrategy(s) {
  if (!s || s.status !== "lista") return null;
  const aid = `a-${String(state.agents.length + 1).padStart(3, "0")}`;
  const agent = {
    id: aid, name: `Incubada ${s.pair} ${s.style} #${s.id}`, role: "Trader",
    department_id: state.departments.find(d => d.slug === "trading").id,
    avatar_seed: Math.floor(Math.random() * 9999), strategy: s.name, pair: s.pair,
    timeframe: s.tf, style: s.style, risk_level: 2, leverage: 2, capital_assigned: 25,
    status: "analizando", mood: "enfocado", incubated: true, level_risk: 2, level_ta: 2, studying: "Gestión de riesgo",
    pnl: 0, win_rate: s.backtest.win, profit_factor: s.backtest.pf, drawdown: 0, trades_count: 0,
    x: 0.45, y: 0.55, last_reason: `Incubada de ${s.name}: backtest ${s.backtest.total}€ sharpe ${s.backtest.sharpe}, robustez ${s.robustness.score}/4, paper ${s.live.pnl}€.`,
  };
  state.agents.push(agent);
  s.status = "activa"; s.agent_id = aid; s.activated_at = new Date().toISOString();
  incubator.persist();
  school.award(state.agents.find(a => a.role === "Optimizer")?.id || state.agents[10].id, "tecnico", 20, `Incuba ${s.name} → capital 25€`);
  memory.add({ author: "Laboratorio", dept: "lab", pair: s.pair, text: `${s.name} supera incubación (paper ${s.live.pnl}€) y recibe 25€ de capital.`, kind: "incubacion" });
  store.audit({ ev: "incubator.promote", id: s.id, agent: aid, pair: s.pair });
  const m = { id: `m-${msgN++}`, channel_id: "c-general", from_agent_id: state.agents[10].id, text: `Laboratorio: ${s.name} aprobada (sharpe ${s.backtest.sharpe}, paper ${s.live.pnl}€). Se incorpora con 25€.`, kind: "alerta", created_at: new Date().toISOString() };
  state.messages.push(m);
  broadcast({ type: "chat", msg: { ...m, from: state.agents[10].name } });
  broadcast({ type: "incubator", stats: incubator.stats(), promoted: s.id });
  return s;
}
app.post("/api/incubator/:id/promote", (req, res) => {
  const s = promoteStrategy(incubator.get(req.params.id));
  if (!s) return res.status(400).json({ error: "no está lista (requiere status=lista)" });
  res.json(s);
});
app.post("/api/incubator/:id/retire", (req, res) => {
  const s = incubator.get(req.params.id);
  if (!s) return res.status(404).json({ error: "not found" });
  s.status = "retirada"; incubator.persist();
  store.audit({ ev: "incubator.retire", id: s.id });
  broadcast({ type: "incubator", stats: incubator.stats() });
  res.json(s);
});

// ---- WS ----
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws/floor" });
function broadcast(obj) {
  const s = JSON.stringify(obj);
  wss.clients.forEach(c => { try { if (c.readyState === 1) c.send(s); } catch {} });
}
wss.on("connection", (ws) => {
  ws.send(JSON.stringify({ type: "init", agents: state.agents, departments: state.departments, tick: lastTick, equity, dayPnl, committee: { active: committee.active } }));
});

// ---- Loop 2s ----
const COMM_SPEAKERS = () => {
  const staff = state.agents.slice(0, 8);
  const top = [...state.agents].filter(a => a.role === "Trader").sort((a, b) => b.pnl - a.pnl).slice(0, 3);
  return [...staff, ...top];
};
setInterval(() => {
  lastTick = market.tick();
  tickN++;
  // cambio de día: se registra si se batió el objetivo y se resetean topes
  const dk = target.dayKey();
  if (dk !== today) {
    const yPnl = Math.round((equity - dayStartEquity) * 100) / 100;
    target.recordDay(today, yPnl, yPnl >= target.DAILY_TARGET);
    store.audit({ ev: "target.day", day: today, pnl: yPnl, hit: yPnl >= target.DAILY_TARGET });
    today = dk;
    dayStartEquity = equity;
    targetAnnounced = false; riskHalted = false;
    Object.keys(tradesToday).forEach(k => delete tradesToday[k]);
    Object.keys(lastPnl).forEach(k => delete lastPnl[k]);
  }
  // buffer live por pair para incubación (máx 150)
  Object.entries(lastTick.prices).forEach(([p, px]) => {
    priceBuffers[p] = priceBuffers[p] || [];
    priceBuffers[p].push(px);
    if (priceBuffers[p].length > 150) priceBuffers[p].shift();
  });
  incubator.updateLive(priceBuffers);
  venuesCache = desks.venues(lastTick.prices);
  // auto-minado cada 6 ticks + auto-promoción de listas (tope 12 activas)
  if (tickN % 6 === 0 && incubator.list().length < 40) {
    const s = incubator.mineOne();
    if (s.status === "incubacion") {
      const m = { id: `m-${msgN++}`, channel_id: "c-general", from_agent_id: state.agents[10].id, text: `Minero: ${s.name} pasa a incubación (backtest ${s.backtest.total}€, sharpe ${s.backtest.sharpe}, robustez ${s.robustness.score}/4).`, kind: "idea", created_at: new Date().toISOString() };
      state.messages.push(m); broadcast({ type: "chat", msg: { ...m, from: state.agents[10].name } });
    }
  }
  incubator.list().filter(s => s.status === "lista").slice(0, 2).forEach(s => {
    if (incubator.stats().activas < 8) promoteStrategy(s);
  });
  // degradación: activas cuyo agente hunde PnL se retiran
  if (tickN % 15 === 0) {
    incubator.list().filter(s => s.status === "activa" && s.agent_id).forEach(s => {
      const ag = state.agents.find(a => a.id === s.agent_id);
      if (ag && ag.pnl < -7.5) {
        s.status = "retirada"; s.retire_reason = `degradada: agente ${ag.pnl}€`;
        risk.suspended.add(ag.id);
        incubator.persist();
        store.audit({ ev: "incubator.degraded", id: s.id, pnl: ag.pnl });
        const m = { id: `m-${msgN++}`, channel_id: "c-general", from_agent_id: state.agents[1].id, text: `Riesgos retira ${s.name}: degrada (${ag.pnl}€). Capital devuelto.`, kind: "alerta", created_at: new Date().toISOString() };
        state.messages.push(m); broadcast({ type: "chat", msg: { ...m, from: state.agents[1].name } });
      }
    });
  }
  committee.ticks += committee.active ? 1 : 0;

  // mover agentes hacia target (comité) o deriva PnL
  state.agents.forEach(a => {
    if (a.tx !== undefined) { a.x += (a.tx - a.x) * 0.25; a.y += (a.ty - a.y) * 0.25; }
  });

  if (committee.active) {
    const sp = COMM_SPEAKERS()[Math.floor(Math.random() * COMM_SPEAKERS().length)];
    const texts = [
      `Comparto análisis: sesgo alcista en ${sp.pair} con ${sp.strategy}.`,
      `Riesgos: exposición ${risk.fundExposure(state.operations, equity)}% bajo control, seguimos.`,
      `Macro RISK-${lastTick.risk_mode}: funding ${lastTick.funding}%, Fear&Greed ${lastTick.fear_greed}.`,
      `Cartera: reforzar a top ranking, recortar a los que van perdiendo.`,
      `Mentoring: los mejores comparten setup con la sala.`,
    ];
    const t = texts[Math.floor(Math.random() * texts.length)];
    const msg = { id: `m-${msgN++}`, channel_id: "c-general", from_agent_id: sp.id, text: t, kind: "analisis", created_at: new Date().toISOString() };
    state.messages.push(msg); committee.log.push(msg.id);
    broadcast({ type: "chat", msg: { ...msg, from: sp.name } });
    if (committee.ticks >= 10) endCommittee(true);
  } else {
    // PnL + auto-trading SELECTIVO (nocional 15-50€, tope 3/día/agente, puerta de calidad).
    // Objetivo batido: se sigue operando en modo proteger-ganancias (8-20€, calidad 0.70, lev ≤2x).
    const statsByStrategy = {};
    target.setupStats(state.operations.filter(o => o.status === "cerrada")).forEach(s => statsByStrategy[s.strategy] = s);
    const relaxed = dayPnl >= target.DAILY_TARGET;
    let openedThisTick = 0; // presupuesto anti-burst: máx 6 aperturas spot por tick
    if (relaxed && !targetAnnounced) {
      targetAnnounced = true;
      store.audit({ ev: "target.hit", dayPnl: Math.round(dayPnl * 100) / 100 });
      const m = { id: `m-${msgN++}`, channel_id: "c-general", from_agent_id: state.agents[0].id, text: `Dirección: objetivo diario batido (+${Math.round(dayPnl)}€). Pasamos a modo proteger-ganancias: sizes pequeños, solo lo mejor.`, kind: "alerta", created_at: new Date().toISOString() };
      state.messages.push(m); broadcast({ type: "chat", msg: { ...m, from: state.agents[0].name } });
    }
    state.agents.forEach(a => {
      if (a.role !== "Trader") return;
      // Sin deriva ficticia: en modo dinero-real cada euro viene de operaciones cerradas.
      a.pnl = Math.round(a.pnl * 100) / 100;
      if (Math.random() > 0.9 || risk.isKilled()) return;
      if ((tradesToday[a.id] || 0) >= target.MAX_TRADES_AGENT_DAY) return;
      const st = statsByStrategy[a.strategy];
      const q = target.score(a, st ? st.avg : 0, st ? st.trades : 0, lastTick, lastPnl[a.id] ?? null);
      if (q < (relaxed ? target.RELAXED.quality : 0.55)) return; // sin señal de calidad no se opera
      if (openedThisTick >= 6) return;
      {
        const side = Math.random() > 0.5 ? "LONG" : "SHORT";
        const entry = lastTick.prices[a.pair] || 100;
        const notional = relaxed ? target.RELAXED.sizeMin + Math.random() * (target.RELAXED.sizeMax - target.RELAXED.sizeMin) : 15 + Math.random() * 35;
        const lev = relaxed ? Math.min(a.leverage, target.RELAXED.maxLev) : a.leverage;
        const prop = { pair: a.pair, side, entry, size: Math.round(notional / entry * 10000) / 10000, leverage: lev };
        const v = risk.checkOperation(a, prop, ctxRisk());
        const op = { id: `op-${opN++}`, agent_id: a.id, agent_name: a.name, strategy: a.strategy, ...prop, size: v.size || prop.size, leverage: v.leverage || prop.leverage, status: v.approved ? "abierta" : "bloqueada", pnl: 0, life: 0, maxLife: 3 + Math.floor(Math.random() * 6), risk_note: v.reason, quality: q, opened_at: new Date().toISOString() };
        state.operations.push(op);
        if (v.approved) { tradesToday[a.id] = (tradesToday[a.id] || 0) + 1; openedThisTick++; broadcast({ type: "operation", op }); }
        else if (Math.random() > 0.7) {
          const m = { id: `m-${msgN++}`, channel_id: "c-general", from_agent_id: state.agents[1].id, text: `Riesgos bloquea a ${a.name}: ${v.reason}`, kind: "alerta", created_at: new Date().toISOString() };
          state.messages.push(m); broadcast({ type: "chat", msg: { ...m, from: state.agents[1].name } });
        }
      }
    });
    // ---- Mesas Fase7 ----
    const arbAgent = state.agents.find(a => a.role === "Arbitrajista") || state.agents[16];
    const derAgent = state.agents.find(a => a.role === "Derivados") || state.agents[14];
    // arbitraje: captura de spread A↔B
    const openArb = state.operations.filter(o => o.status === "abierta" && o.desk === "arbitraje");
    const prop = desks.scanArb(venuesCache, openArb.length);
    if (prop && !risk.isKilled()) {
      const px = lastTick.prices[prop.pair];
      const arbSize = Math.round(150 / px * 10000) / 10000;
      const va = risk.checkOperation(arbAgent, { pair: prop.pair, entry: px, size: arbSize, leverage: 1 }, ctxRisk());
      if (!va.approved) {
        const bop = { id: `op-${opN++}`, agent_id: arbAgent.id, agent_name: arbAgent.name, desk: "arbitraje", pair: prop.pair, side: "ARB", entry: px, status: "bloqueada", pnl: 0, risk_note: va.reason, opened_at: new Date().toISOString() };
        state.operations.push(bop);
        store.audit({ ev: "arb.blocked", pair: prop.pair, reason: va.reason });
      } else {
      const op = { id: `op-${opN++}`, agent_id: arbAgent.id, agent_name: arbAgent.name, desk: "arbitraje", pair: prop.pair, side: "ARB", entry: px, spreadOpen: prop.spreadOpen, buyAt: prop.buyAt, size: arbSize, leverage: 1, status: "abierta", pnl: 0, life: 0, maxLife: 12, risk_note: `Arb ${prop.buyAt}→${prop.buyAt === "A" ? "B" : "A"} spread ${prop.spreadOpen}%`, opened_at: new Date().toISOString() };
      state.operations.push(op);
      store.audit({ ev: "arb.open", id: op.id, pair: op.pair, spread: prop.spreadOpen });
      broadcast({ type: "operation", op });
      }
    }
    openArb.forEach(o => {
      const sp = desks.spreadOf(venuesCache[o.pair]);
      const st = desks.arbPnl(o.spreadOpen, sp, o.pair, o.size * o.entry);
      o.pnl = st.net; o.fees = st.costs; o.life++;
      if (sp < desks.arbCostPct(o.pair) / 2 || o.life >= o.maxLife) {
        o.status = "cerrada"; o.exit = sp; o.closed_at = new Date().toISOString();
        o.close_reason = sp < 0.05 ? `spread ${o.spreadOpen}%→${Math.round(sp * 100) / 100}%` : "timeout";
        const ag = state.agents.find(a => a.id === o.agent_id);
        if (ag) { ag.pnl = Math.round((ag.pnl + o.pnl) * 100) / 100; ag.trades_count++; lastPnl[ag.id] = o.pnl; school.award(ag.id, "tecnico", o.pnl > 0 ? 6 : 3, `Arb ${o.pair} ${o.close_reason} PnL ${o.pnl}€`); }
        store.audit({ ev: "arb.close", id: o.id, pnl: o.pnl, reason: o.close_reason });
        broadcast({ type: "operation", op: { ...o } });
      }
    });
    // derivados: futuros con funding
    const openDer = state.operations.filter(o => o.status === "abierta" && o.desk === "derivados");
    if (tickN % 4 === 0 && openDer.length < 4 && !risk.isKilled()) {
      const pair = Math.random() > 0.5 ? "BTC" : "ETH";
      const side = Math.random() > 0.5 ? "LONG" : "SHORT";
      const propF = { pair, side, entry: lastTick.prices[pair], size: Math.round(25 / lastTick.prices[pair] * 10000) / 10000, leverage: 3 + Math.floor(Math.random() * 3) };
      const v = risk.checkOperation(derAgent, propF, ctxRisk());
      const op = { id: `op-${opN++}`, agent_id: derAgent.id, agent_name: derAgent.name, strategy: derAgent.strategy, desk: "derivados", kind: "FUTURO", ...propF, size: v.size || propF.size, leverage: v.leverage || propF.leverage, status: v.approved ? "abierta" : "bloqueada", pnl: 0, life: 0, maxLife: 10, fundingAcc: 0, risk_note: v.approved ? `Futuro ${side} (funding ${lastTick.funding}%)` : v.reason, opened_at: new Date().toISOString() };
      state.operations.push(op);
      store.audit({ ev: "deriv.open", id: op.id, pair, side, status: op.status });
      if (v.approved) broadcast({ type: "operation", op });
    }
    // coberturas: hedge SHORT BTC si riesgo alto
    const sig = desks.hedgeSignal(risk.fundExposure(state.operations, equity), drawdown);
    const openHedge = state.operations.filter(o => o.status === "abierta" && o.desk === "cobertura");
    if (sig === "open" && !openHedge.length) {
      const px = lastTick.prices.BTC;
      const op = { id: `op-${opN++}`, agent_id: state.agents[1].id, agent_name: state.agents[1].name, desk: "cobertura", pair: "BTC", side: "SHORT", entry: px, size: Math.round(equity * 0.3 / px * 10000) / 10000, leverage: 1, status: "abierta", pnl: 0, life: 0, maxLife: 30, risk_note: "Mandato Riesgos: hedge cartera", opened_at: new Date().toISOString() };
      state.operations.push(op);
      store.audit({ ev: "hedge.open", id: op.id, equity: Math.round(equity) });
      const m = { id: `m-${msgN++}`, channel_id: "c-general", from_agent_id: state.agents[1].id, text: `Cobertura activada: SHORT BTC 30% patrimonio (expo/DD altos).`, kind: "alerta", created_at: new Date().toISOString() };
      state.messages.push(m); broadcast({ type: "chat", msg: { ...m, from: state.agents[1].name } });
      broadcast({ type: "operation", op });
    }
    if (sig === "close") openHedge.forEach(o => {
      const px = lastTick.prices.BTC;
      const gross = Math.round((o.entry - px) / o.entry * o.size * o.entry * 100) / 100;
      const st = costs.settle(gross, o.size, o.entry, px, costs.costPerSide(o.pair, "spot"));
      o.pnl = st.net; o.fees = st.costs;
      o.status = "cerrada"; o.exit = px; o.closed_at = new Date().toISOString(); o.close_reason = "riesgo normalizado";
      const ag = state.agents.find(a => a.id === o.agent_id);
      if (ag) { ag.pnl = Math.round((ag.pnl + o.pnl) * 100) / 100; lastPnl[ag.id] = o.pnl; }
      store.audit({ ev: "hedge.close", id: o.id, pnl: o.pnl });
      broadcast({ type: "operation", op: { ...o } });
    });
    // seguimiento y cierre de abiertas (spot + derivados + cobertura; arb va aparte)
    state.operations.filter(o => o.status === "abierta" && o.desk !== "arbitraje").forEach(o => {
      const px = lastTick.prices[o.pair]; if (!px) return;
      const dir = o.side === "LONG" ? 1 : -1;
      const chg = (px - o.entry) / o.entry;
      if (o.desk === "derivados") o.fundingAcc = Math.round(((o.fundingAcc || 0) + o.size * o.entry * lastTick.funding / 100 * (o.side === "LONG" ? 1 : -1)) * 100) / 100;
      o.pnl = Math.round((chg * dir * o.size * o.entry * o.leverage - (o.fundingAcc || 0)) * 100) / 100;
      o.life++;
      const tp = chg * dir > 0.02, sl = chg * dir < -0.01, timeout = o.life >= o.maxLife;
      if (tp || sl || timeout) {
        o.status = "cerrada"; o.exit = px; o.closed_at = new Date().toISOString();
        o.close_reason = tp ? "TP +2%" : sl ? "SL -1%" : "timeout";
        const stl = costs.settle(o.pnl, o.size, o.entry, px, costs.costPerSide(o.pair, o.desk));
        o.pnl = stl.net; o.fees = stl.costs;
        const ag = state.agents.find(a => a.id === o.agent_id);
        if (ag) {
          ag.pnl = Math.round((ag.pnl + o.pnl) * 100) / 100; ag.trades_count++; lastPnl[ag.id] = o.pnl;
          school.xpForClose(o).forEach(g => school.award(ag.id, g.s, g.x, `${o.side} ${o.pair} ${o.close_reason} PnL ${o.pnl}€`));
          if (Math.abs(o.pnl) > 25) memory.add({ author: ag.name, dept: "trading", pair: o.pair, text: `${o.side} ${o.pair} ${o.close_reason} (${o.pnl}€) con ${ag.strategy}. ${o.close_reason.startsWith("SL") ? "Lección: respetar stop y size." : "Funciona: dejar correr con trailing."}`, kind: o.pnl > 0 ? "leccion-ganada" : "leccion-perdida" });
          const ups = school.forAgent(ag.id, 3).reduce((s, l) => s + l.xp, 0);
          if (ups >= 100 && ag.level_risk < 5) { ag.level_risk++; ag.level_ta = Math.min(5, ag.level_ta + 0); }
          ag.last_reason = `${o.side} ${o.pair} cerrada en ${px} (${o.close_reason}) PnL ${o.pnl}€ · ${o.risk_note}`;
        }
        store.audit({ ev: "op.close", id: o.id, agent: o.agent_id, pair: o.pair, pnl: o.pnl, reason: o.close_reason });
        broadcast({ type: "operation", op: { ...o } });
      }
    });
    trimOps();

    // chat autónomo
    for (let i = 0; i < (Math.random() > 0.4 ? 1 : 2); i++) {
      const a = state.agents[Math.floor(Math.random() * state.agents.length)];
      if (committee.active) break;
      a.status = "hablando";
      const base = agentMsg(a);
      const text = Math.random() > 0.7 ? `${base} ${memory.cite()}` : base;
      const msg = { id: `m-${msgN++}`, channel_id: Math.random() > 0.75 ? `c-${state.departments.find(d => d.id === a.department_id).slug}` : "c-general", from_agent_id: a.id, text, kind: "idea", created_at: new Date().toISOString() };
      state.messages.push(msg);
      if (state.messages.length > 500) state.messages.splice(0, state.messages.length - 500);
      broadcast({ type: "chat", msg: { ...msg, from: a.name } });
    }
  }

  const tot = state.agents.filter(a => a.role === "Trader").reduce((s, a) => s + a.pnl, 0)
    + state.operations.filter(o => o.status === "abierta").reduce((s, o) => s + o.pnl, 0);
  equity = Math.round((FUND_BASE + tot) * 100) / 100;
  dayPnl = Math.round((equity - dayStartEquity) * 100) / 100; // día real: desde las 00:00 UTC
  peakEquity = Math.max(peakEquity, equity);
  drawdown = Math.round(((peakEquity - equity) / peakEquity) * 10000) / 100;
  if (dayPnl <= risk.FUND_LIMITS.max_day_loss && !riskHalted) {
    riskHalted = true;
    store.audit({ ev: "risk.halt", dayPnl: Math.round(dayPnl * 100) / 100 });
    const m = { id: `m-${msgN++}`, channel_id: "c-general", from_agent_id: state.agents[1].id, text: `Riesgos frena la operativa: día en ${Math.round(dayPnl)}€ bajo el límite ${risk.FUND_LIMITS.max_day_loss}€. Solo se gestionan abiertas hasta mañana.`, kind: "alerta", created_at: new Date().toISOString() };
    state.messages.push(m); broadcast({ type: "chat", msg: { ...m, from: state.agents[1].name } });
  }
  // auto-suspender peor trader si hunde el día (2x el límite diario)
  if (dayPnl <= risk.FUND_LIMITS.max_day_loss * 2) {
    const worst = [...state.agents].filter(a => a.role === "Trader").sort((a, b) => a.pnl - b.pnl)[0];
    if (worst && !risk.suspended.has(worst.id)) {
      risk.suspended.add(worst.id);
      const m = { id: `m-${msgN++}`, channel_id: "c-general", from_agent_id: state.agents[1].id, text: `Riesgos suspende a ${worst.name} por drawdown (${Math.round(worst.pnl)}€).`, kind: "alerta", created_at: new Date().toISOString() };
      state.messages.push(m); broadcast({ type: "chat", msg: { ...m, from: state.agents[1].name } });
    }
  }

  broadcast({ type: "tick", tick: lastTick, equity, dayPnl, drawdown, exposure: risk.fundExposure(state.operations, equity), kill: risk.isKilled(), halt: dayPnl <= risk.FUND_LIMITS.max_day_loss, committee: committee.active, agents: state.agents.map(a => ({ id: a.id, status: a.status, pnl: a.pnl, x: a.x, y: a.y })) });
  if (tickN % 30 === 0) {
    state.snapshots.push({ ts: new Date().toISOString(), equity, dayPnl, drawdown, exposure: risk.fundExposure(state.operations, equity) });
    if (state.snapshots.length > 20000) state.snapshots.splice(0, state.snapshots.length - 20000);
  }
  if (tickN % 5 === 0) persist();
}, 2000);

server.listen(PORT, () => console.log(`AI Trading Floor Fase7 en http://localhost:${PORT}`));
