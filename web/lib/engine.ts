// Motor por pasos: port fiel del loop de backend/src/index.js como step()
// determinista. Sin I/O, sin Math.random/Date directos: todo via input.
// Los eventos sustituyen al broadcast WS (el frontend hace polling).
import { seedRand, hashStr, type Rng } from "./rng.js";
import { tickMarket, type MarketState, type MarketTick } from "./market.js";
import { checkOperation, fundExposure, FUND_LIMITS } from "./risk.js";
import { costPerSide, settle } from "./costs.js";
import { venues, scanArb, spreadOf, arbPnl, arbCostPct, hedgeSignal } from "./desks.js";
import { genHistory, metrics, robustness, liveSignal, runTrades } from "./indicators.js";
import { setupStats, agentStats, score, sizeFor, memoryBias, DAILY_TARGET, MAX_TRADES_AGENT_DAY, RELAXED } from "./target.js";
import { xpForClose, award } from "./school.js";
import type { KvStore } from "./store.js";
import { repo } from "./state.js";

export interface EngineState {
  meta: { tickN: number; opN: number; msgN: number; stN: number; today: string; dayStartEquity: number; equity: number; peakEquity: number; dayPnl: number; drawdown: number; kill: boolean; suspended: string[]; targetAnnounced: boolean };
  market: MarketState & { lastTick: MarketTick };
  agents: Record<string, any>;
  order: string[];
  committee: { active: boolean; topic: string; started_at: string | null; ticks: number; backup: Record<string, { x: number; y: number }>; log: string[] };
  day: { trades: Record<string, number>; last: Record<string, number>; lossTick: Record<string, number> };
  openOps: Record<string, any>;
  closed: any[]; blocked: any[];
  msgs: any[]; meetings: any[]; memory: any[]; xp: Record<string, any>; learnings: any[];
  strategies: Record<string, any>; snapshots: any[]; audit: any[];
  targetDays: Record<string, any>; bufs: Record<string, number[]>;
  venues: Record<string, { a: number; b: number; eps?: number }>; eps: Record<string, number>;
  departments: any[];
}

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
const TEMPLATES = [
  { style: "tendencia", tf: "1h", kind: "ema" }, { style: "mean reversion", tf: "15m", kind: "rsi" },
  { style: "breakout", tf: "4h", kind: "donchian" }, { style: "swing", tf: "1D", kind: "ema" },
  { style: "scalping", tf: "5m", kind: "rsi" },
] as Array<{ style: string; tf: string; kind: "ema" | "rsi" | "donchian" }>;
const PAIRS = ["BTC", "ETH", "SOL", "XRP", "BNB", "DOGE", "ADA", "AVAX", "LINK"];

function agentMsg(a: any, rnd: Rng): string {
  const t = IDEAS[Math.floor(rnd() * IDEAS.length)];
  return t.replace("{P}", a.pair).replace("{S}", String(a.strategy).split(" ")[0]);
}
function memCite(memory: any[], rnd: Rng): string {
  if (!memory.length) return "";
  const m = memory[Math.floor(rnd() * Math.min(5, memory.length))];
  return `Memoria [${m.pair}·${m.author}]: ${String(m.text).slice(0, 90)}`;
}
function pushMem(s: EngineState, e: any) {
  s.memory.unshift(e);
  if (s.memory.length > 200) s.memory.length = 200;
}
function pushMsg(s: EngineState, events: any[], m: any, fromName: string) {
  s.msgs.push(m);
  if (s.msgs.length > 500) s.msgs.splice(0, s.msgs.length - 500);
  events.push({ type: "chat", msg: { ...m, from: fromName } });
}
function awardXp(s: EngineState, agentId: string, subject: string, amount: number, note: string, ts: string) {
  const e = award(s.xp, agentId, subject, amount, note, ts);
  s.learnings.unshift(e);
  if (s.learnings.length > 300) s.learnings.length = 300;
}
function agentLevelUps(s: EngineState, agentId: string): number {
  return s.learnings.filter(l => l.agent_id === agentId).slice(0, 3).reduce((x: number, l: any) => x + l.xp, 0);
}

function committeeSummary(s: EngineState, nowIso: string) {
  const top = Object.values(s.agents).filter((a: any) => a.role === "Trader").sort((a: any, b: any) => b.pnl - a.pnl).slice(0, 3);
  const open = Object.values(s.openOps);
  return {
    topic: s.committee.topic, ended_at: nowIso,
    patrimonio: Math.round(s.meta.equity), dayPnl: Math.round(s.meta.dayPnl * 100) / 100,
    exposure: fundExposure(open as any, s.meta.equity),
    top3: top.map((t: any) => ({ name: t.name, setup: t.strategy, pnl: Math.round(t.pnl * 100) / 100 })),
    decisions: [
      `Capital protegido: exposición ${fundExposure(open as any, s.meta.equity)}% dentro de límite`,
      top[0] ? `Refuerzo a ${top[0].name} (${top[0].strategy}) por liderar ranking` : "Sin datos de ranking",
      s.committee.ticks >= 8 ? "Consenso macro RISK-ON: mantener operativa" : "Comité breve: mantener operativa con prudencia",
    ],
    messages: s.committee.log.length,
  };
}

function endCommittee(s: EngineState, events: any[], nowIso: string, auto: boolean) {
  if (!s.committee.active) return null;
  s.committee.active = false;
  for (const [id, p] of Object.entries(s.committee.backup)) {
    const a = s.agents[id];
    if (a) { a.tx = p.x; a.ty = p.y; a.status = "analizando"; }
  }
  const summary = committeeSummary(s, nowIso);
  s.meetings.unshift({ id: `meet-${nowIso}-${auto ? "a" : "m"}`, ...summary, auto });
  if (s.meetings.length > 20) s.meetings.length = 20;
  pushMem(s, { id: `mem-c-${nowIso}`, ts: nowIso, author: "Dirección CIO", dept: "direccion", pair: "FONDO", text: `Comité: ${summary.decisions.join(" · ")}`, kind: "comite" });
  const ranked = Object.values(s.agents).filter((a: any) => a.role === "Trader").sort((a: any, b: any) => b.pnl - a.pnl);
  const best = ranked[0] as any, worst = ranked[ranked.length - 1] as any;
  if (best && worst && best.id !== worst.id) {
    awardXp(s, worst.id, "tecnico", 12, `Mentoring de ${best.name}: comparte ${best.strategy}`, nowIso);
    const mm = { id: `m-ment-${nowIso}`, channel_id: "c-general", from_agent_id: best.id, text: `Mentoring para ${worst.name}: mi ${best.strategy} en ${best.pair} funciona si respetas el stop.`, kind: "mentoring", created_at: nowIso };
    pushMsg(s, events, mm, best.name);
  }
  s.audit.push({ ts: nowIso, ev: "committee.end", topic: summary.topic, auto, top: summary.top3.map((t: any) => t.name) });
  const first = s.agents[s.order[0]];
  const m = { id: `m-cend-${nowIso}`, channel_id: "c-general", from_agent_id: first.id, text: `Comité cerrado. Conclusiones: ${summary.decisions.join(" · ")}`, kind: "alerta", created_at: nowIso };
  pushMsg(s, events, m, first.name);
  events.push({ type: "committee", phase: "ended", summary });
  return summary;
}

function mineOnePure(s: EngineState, rnd: Rng, nowIso: string) {
  const t = TEMPLATES[Math.floor(rnd() * TEMPLATES.length)];
  const pair = PAIRS[Math.floor(rnd() * PAIRS.length)];
  const span = t.kind === "ema" ? 12 : t.kind === "rsi" ? 14 : 40;
  const base = t.kind === "ema" ? 5 : t.kind === "rsi" ? 7 : 15;
  const p1 = base + Math.floor(rnd() * span);
  const spec = { kind: t.kind, p1, pair };
  const closes = genHistory(pair);
  const backtest = metrics(runTrades(spec, closes));
  const stId = `st-${s.meta.stN++}`;
  const st: any = {
    id: stId, name: `Minera ${t.kind.toUpperCase()} ${pair} ${t.tf} p${p1}`,
    pair, tf: t.tf, style: t.style, kind: t.kind, p1, status: "backtest", created_at: nowIso, backtest,
  };
  if (backtest.trades < 10 || backtest.total <= 0 || backtest.sharpe < 0.2) {
    st.status = "descartada"; st.discard = "backtest bajo umbral (trades>10, total>0, sharpe>0.2)";
  } else {
    const rob = robustness(spec, closes, rnd);
    st.robustness = rob; st.status = "robustez";
    if (!rob.pass) { st.status = "descartada"; st.discard = `robustez ${rob.score}/4 insuficiente`; }
    else { st.status = "incubacion"; st.live = { equity: 100, pnl: 0, ticks: 0, peak: 100, dd: 0, pos: null }; }
  }
  s.strategies[stId] = st;
  s.audit.push({ ts: nowIso, ev: "incubator.mine.one", id: stId, status: st.status });
  return st;
}

function promoteStrategy(s: EngineState, events: any[], x: any, nowIso: string) {
  if (!x || x.status !== "lista") return;
  const ids = Object.keys(s.agents);
  const aid = `a-${String(ids.length + 1).padStart(3, "0")}`;
  const trading = Object.values(s.agents).find((a: any) => a.department_id === "d-trading") as any;
  const agent = {
    id: aid, name: `Incubada ${x.pair} ${x.style} #${x.id}`, role: "Trader",
    department_id: trading?.department_id || "d-trading",
    avatar_seed: 1000 + ids.length, strategy: x.name, pair: x.pair,
    timeframe: x.tf, style: x.style, risk_level: 2, leverage: 2, capital_assigned: 25,
    status: "analizando", mood: "enfocado", incubated: true, level_risk: 2, level_ta: 2, studying: "Gestión de riesgo",
    pnl: 0, win_rate: x.backtest?.win ?? 50, profit_factor: x.backtest?.pf ?? 1, drawdown: 0, trades_count: 0,
    x: 0.45, y: 0.55, last_reason: `Incubada de ${x.name}: supera incubación y recibe 25€.`,
  };
  s.agents[aid] = agent;
  s.order.push(aid);
  x.status = "activa"; x.agent_id = aid; x.activated_at = nowIso;
  const optimizer = Object.values(s.agents).find((a: any) => a.role === "Optimizer") || s.agents[s.order[10]];
  awardXp(s, optimizer.id, "tecnico", 20, `Incuba ${x.name} → capital 25€`, nowIso);
  pushMem(s, { id: `mem-p-${nowIso}-${x.id}`, ts: nowIso, author: "Laboratorio", dept: "lab", pair: x.pair, text: `${x.name} supera incubación y recibe 25€ de capital.`, kind: "incubacion" });
  s.audit.push({ ts: nowIso, ev: "incubator.promote", id: x.id, agent: aid, pair: x.pair });
  const lab = s.agents[s.order[10]];
  pushMsg(s, events, { id: `m-pro-${nowIso}-${x.id}`, channel_id: "c-general", from_agent_id: lab.id, text: `Laboratorio: ${x.name} aprobada. Se incorpora con 25€.`, kind: "alerta", created_at: nowIso }, lab.name);
  events.push({ type: "incubator", promoted: x.id });
}

export interface StepInput { slot: string; nowIso: string; rnd: Rng }

export function step(s: EngineState, input: StepInput): { state: EngineState; events: any[] } {
  const { slot, nowIso, rnd } = input;
  const events: any[] = [];
  let k = 0;
  const opId = () => `op-${slot}-${k++}`;
  const msgId = () => `m-${slot}-${k++}`;
  const meta = s.meta;
  meta.tickN++;

  // 1. rollover diario
  const dk = nowIso.slice(0, 10);
  if (dk !== meta.today) {
    const yPnl = Math.round((meta.equity - meta.dayStartEquity) * 100) / 100;
    s.targetDays[meta.today] = { pnl: yPnl, hit: yPnl >= DAILY_TARGET };
    s.audit.push({ ts: nowIso, ev: "target.day", day: meta.today, pnl: yPnl, hit: yPnl >= DAILY_TARGET });
    meta.today = dk; meta.dayStartEquity = meta.equity; meta.targetAnnounced = false;
    s.day = { trades: {}, last: {}, lossTick: {} };
  }

  // 2. mercado
  const mr = tickMarket({ prices: s.market.prices, hist: s.market.hist, regime: s.market.regime, regimeLeft: s.market.regimeLeft, trendDir: s.market.trendDir }, rnd, nowIso);
  s.market = { ...mr.state, lastTick: mr.tick };
  const lastTick = mr.tick;

  // buffers para incubación (máx 150)
  for (const [p, px] of Object.entries<number>(lastTick.prices)) {
    s.bufs[p] = s.bufs[p] || [];
    s.bufs[p].push(px);
    if (s.bufs[p].length > 150) s.bufs[p].shift();
  }

  // 3. incubadora live
  const strategies = Object.values(s.strategies) as any[];
  strategies.filter(x => x.status === "incubacion").forEach((x: any) => {
    const buf = s.bufs[x.pair] || [];
    if (buf.length < 40 || x.live.pos === undefined) return;
    x.live.ticks++;
    const closes = buf.slice(-60);
    const sig = liveSignal({ kind: x.kind, p1: x.p1, pair: x.pair }, closes);
    const px = buf[buf.length - 1];
    const L = x.live;
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
    if (L.ticks >= 50 && L.pnl > 4 && L.dd < 6) x.status = "lista";
    else if (L.ticks >= 100 && L.pnl <= 0) { x.status = "descartada"; x.discard = `incubación paper ${L.pnl}€ en ${L.ticks} ticks`; }
  });

  // venues
  const vr = venues(lastTick.prices, s.eps, rnd);
  s.venues = vr.out; s.eps = vr.eps;

  // auto-minado cada 6 steps + auto-promoción (tope 8 activas)
  if (meta.tickN % 6 === 0 && strategies.length < 40) {
    const st = mineOnePure(s, rnd, nowIso);
    if (st.status === "incubacion") {
      const lab = s.agents[s.order[10]];
      pushMsg(s, events, { id: msgId(), channel_id: "c-general", from_agent_id: lab.id, text: `Minero: ${st.name} pasa a incubación (backtest ${st.backtest.total}€, sharpe ${st.backtest.sharpe}, robustez ${st.robustness.score}/4).`, kind: "idea", created_at: nowIso }, lab.name);
    }
  }
  Object.values(s.strategies).filter((x: any) => x.status === "lista").slice(0, 2).forEach((x: any) => {
    if (Object.values(s.strategies).filter((y: any) => y.status === "activa").length < 8) promoteStrategy(s, events, x, nowIso);
  });

  // degradación cada 15 steps
  if (meta.tickN % 15 === 0) {
    Object.values(s.strategies).filter((x: any) => x.status === "activa" && x.agent_id).forEach((x: any) => {
      const ag = s.agents[x.agent_id];
      if (ag && ag.pnl < -7.5) {
        x.status = "retirada"; x.retire_reason = `degradada: agente ${ag.pnl}€`;
        if (!meta.suspended.includes(ag.id)) meta.suspended.push(ag.id);
        s.audit.push({ ts: nowIso, ev: "incubator.degraded", id: x.id, pnl: ag.pnl });
        const rman = Object.values(s.agents).find((a: any) => /Risk Manager/i.test(a.role)) || s.agents[s.order[1]];
        pushMsg(s, events, { id: msgId(), channel_id: "c-general", from_agent_id: rman.id, text: `Riesgos retira ${x.name}: degrada (${ag.pnl}€). Capital devuelto.`, kind: "alerta", created_at: nowIso }, rman.name);
      }
    });
  }

  s.committee.ticks += s.committee.active ? 1 : 0;
  for (const id of s.order) {
    const a = s.agents[id];
    if (a.tx !== undefined) { a.x += (a.tx - a.x) * 0.25; a.y += (a.ty - a.y) * 0.25; }
  }

  if (s.committee.active) {
    const staff = s.order.slice(0, 8).map(id => s.agents[id]);
    const top = Object.values(s.agents).filter((a: any) => a.role === "Trader").sort((a: any, b: any) => b.pnl - a.pnl).slice(0, 3);
    const pool = [...staff, ...top];
    const sp = pool[Math.floor(rnd() * pool.length)];
    const texts = [
      `Comparto análisis: sesgo alcista en ${sp.pair} con ${sp.strategy}.`,
      `Riesgos: exposición ${fundExposure(Object.values(s.openOps) as any, meta.equity)}% bajo control, seguimos.`,
      `Macro RISK-${lastTick.risk_mode}: funding ${lastTick.funding}%, Fear&Greed ${lastTick.fear_greed}.`,
      `Cartera: reforzar a top ranking, recortar a los que van perdiendo.`,
      `Mentoring: los mejores comparten setup con la sala.`,
    ];
    const msg = { id: msgId(), channel_id: "c-general", from_agent_id: sp.id, text: texts[Math.floor(rnd() * texts.length)], kind: "analisis", created_at: nowIso };
    pushMsg(s, events, msg, sp.name);
    s.committee.log.push(msg.id);
    if (s.committee.ticks >= 10) endCommittee(s, events, nowIso, true);
  } else {
    tradeBlock(s, events, lastTick, nowIso, rnd, opId, msgId);
    for (let i = 0; i < (rnd() > 0.4 ? 1 : 2); i++) {
      const a = s.agents[s.order[Math.floor(rnd() * s.order.length)]];
      a.status = "hablando";
      const base = agentMsg(a, rnd);
      const text = rnd() > 0.7 ? `${base} ${memCite(s.memory, rnd)}` : base;
      const dept = s.departments.find((d: any) => d.id === a.department_id);
      pushMsg(s, events, { id: msgId(), channel_id: rnd() > 0.75 && dept ? `c-${dept.slug}` : "c-general", from_agent_id: a.id, text, kind: "idea", created_at: nowIso }, a.name);
    }
  }

  // equity del fondo
  const tot = Object.values(s.agents).filter((a: any) => a.role === "Trader").reduce((x: number, a: any) => x + a.pnl, 0)
    + Object.values(s.openOps).filter((o: any) => o.status === "abierta").reduce((x: number, o: any) => x + (o.pnl || 0), 0);
  meta.equity = Math.round((500 + tot) * 100) / 100;
  meta.dayPnl = Math.round((meta.equity - meta.dayStartEquity) * 100) / 100;
  meta.peakEquity = Math.max(meta.peakEquity, meta.equity);
  meta.drawdown = Math.round(((meta.peakEquity - meta.equity) / meta.peakEquity) * 10000) / 100;
  events.push({ type: "tick", tick: lastTick, equity: meta.equity, dayPnl: meta.dayPnl, drawdown: meta.drawdown, exposure: fundExposure(Object.values(s.openOps) as any, meta.equity), kill: meta.kill, committee: s.committee.active });
  if (meta.tickN % 30 === 0) {
    s.snapshots.push({ ts: nowIso, equity: meta.equity, dayPnl: meta.dayPnl, drawdown: meta.drawdown, exposure: fundExposure(Object.values(s.openOps) as any, meta.equity) });
    if (s.snapshots.length > 500) s.snapshots.splice(0, s.snapshots.length - 500);
  }
  return { state: s, events };
}

function tradeBlock(s: EngineState, events: any[], lastTick: MarketTick, nowIso: string, rnd: Rng, opId: () => string, msgId: () => string) {
  const closed = [...s.closed];
  const byStrategy: Record<string, any> = {};
  setupStats(closed).forEach(x => (byStrategy[x.strategy] = x));
  const agm = agentStats(closed);
  const relaxed = s.meta.dayPnl >= DAILY_TARGET;
  let openedThisTick = 0;
  if (relaxed && !s.meta.targetAnnounced) {
    s.meta.targetAnnounced = true;
    s.audit.push({ ts: nowIso, ev: "target.hit", dayPnl: Math.round(s.meta.dayPnl * 100) / 100 });
    const first = s.agents[s.order[0]];
    pushMsg(s, events, { id: msgId(), channel_id: "c-general", from_agent_id: first.id, text: `Dirección: objetivo diario batido (+${Math.round(s.meta.dayPnl)}€). Pasamos a modo proteger-ganancias: sizes pequeños, solo lo mejor.`, kind: "alerta", created_at: nowIso }, first.name);
  }
  for (const id of s.order) {
    const a = s.agents[id];
    if (a.role !== "Trader") continue;
    a.pnl = Math.round(a.pnl * 100) / 100;
    if (rnd() > 0.9 || s.meta.kill) continue;
    if ((s.day.trades[a.id] || 0) >= MAX_TRADES_AGENT_DAY) continue;
    const st = byStrategy[a.strategy];
    const ag = agm[a.id];
    const memBias = memoryBias(s.memory.filter((e: any) => e.pair === a.pair).slice(-20).map((e: any) => ({ kind: e.kind })));
    const q = score(a, st, lastTick as any, s.day.last[a.id] ?? null, ag ? (ag.wins / ag.trades * 100) : 100, ag ? ag.trades : 0, memBias);
    if (q < (relaxed ? RELAXED.quality : 0.55)) continue;
    if (s.meta.tickN - (s.day.lossTick[a.id] ?? -9999) < 10) continue;
    if (openedThisTick >= 6) break;
    const mom = (lastTick.trend && (lastTick.trend as any)[a.pair]) || 0;
    const trendStyle = a.style === "tendencia" || a.style === "breakout";
    let side: string | null = null;
    if (trendStyle) {
      if (Math.abs(mom) < 0.2) continue;
      side = mom > 0 ? "LONG" : "SHORT";
    } else {
      if (Math.abs(mom) < 0.5) continue;
      side = mom > 0 ? "SHORT" : "LONG";
    }
    if (side === "LONG" && lastTick.funding > 0.03 && rnd() > 0.3) continue;
    {
      const entry = (lastTick.prices as any)[a.pair] || 100;
      const tier = relaxed ? 14 : sizeFor(q, st ? st.trades : 0);
      const notional = relaxed ? RELAXED.sizeMin + rnd() * (RELAXED.sizeMax - RELAXED.sizeMin) : tier;
      const lev = relaxed ? Math.min(a.leverage, RELAXED.maxLev) : Math.min(a.leverage, 1 + (a.level_risk || 1), 5);
      const prop = { pair: a.pair, side, entry, size: Math.round(notional / entry * 10000) / 10000, leverage: lev };
      const v = checkOperation(
        { id: a.id, name: a.name, leverage: a.leverage, pnl: a.pnl }, prop,
        { equity: s.meta.equity, killSwitch: s.meta.kill, suspended: s.meta.suspended, openOps: Object.values(s.openOps) as any }
      );
      const op: any = {
        id: opId(), agent_id: a.id, agent_name: a.name, strategy: a.strategy, ...prop,
        size: v.size || prop.size, leverage: v.leverage || prop.leverage,
        status: v.approved ? "abierta" : "bloqueada", pnl: 0, life: 0,
        maxLife: 40 + Math.floor(rnd() * 40), risk_note: v.reason, quality: q, opened_at: nowIso,
      };
      if (v.approved) { s.openOps[op.id] = op; s.day.trades[a.id] = (s.day.trades[a.id] || 0) + 1; openedThisTick++; }
      else {
        s.blocked.push(op);
        if (s.blocked.length > 80) s.blocked.splice(0, s.blocked.length - 80);
        if (rnd() > 0.7) {
          const rman = Object.values(s.agents).find((x: any) => /Risk Manager/i.test(x.role)) || s.agents[s.order[1]];
          pushMsg(s, events, { id: msgId(), channel_id: "c-general", from_agent_id: rman.id, text: `Riesgos bloquea a ${a.name}: ${v.reason}`, kind: "alerta", created_at: nowIso }, rman.name);
        }
      }
      events.push({ type: "operation", op: { ...op } });
    }
  }
  desksBlock(s, events, lastTick, nowIso, rnd, opId, msgId);
  Object.values(s.openOps).filter((o: any) => o.status === "abierta" && o.desk !== "arbitraje").forEach((o: any) => {
    const px = (lastTick.prices as any)[o.pair];
    if (!px) return;
    const dir = o.side === "LONG" ? 1 : -1;
    const chg = (px - o.entry) / o.entry;
    if (o.desk === "derivados") o.fundingAcc = Math.round(((o.fundingAcc || 0) + o.size * o.entry * lastTick.funding / 100 * (o.side === "LONG" ? 1 : -1)) * 100) / 100;
    o.pnl = Math.round((chg * dir * o.size * o.entry * o.leverage - (o.fundingAcc || 0)) * 100) / 100;
    o.life++;
    const tp = chg * dir > 0.007, sl = chg * dir < -0.0035, timeout = o.life >= o.maxLife;
    if (tp || sl || timeout) {
      o.status = "cerrada"; o.exit = px; o.closed_at = nowIso;
      o.close_reason = tp ? "TP +0.7%" : sl ? "SL -0.35%" : "timeout";
      const stl = settle(o.pnl, o.size, o.entry, px, costPerSide(o.pair, o.desk));
      o.pnl = stl.net; o.fees = stl.costs;
      const ag = s.agents[o.agent_id];
      if (ag) {
        ag.pnl = Math.round((ag.pnl + o.pnl) * 100) / 100; ag.trades_count++;
        s.day.last[ag.id] = o.pnl;
        if (o.pnl < 0) s.day.lossTick[ag.id] = s.meta.tickN;
        xpForClose(o.pnl).forEach((g: any) => {
          const e = award(s.xp, ag.id, g.s, g.x, `${o.side} ${o.pair} ${o.close_reason} PnL ${o.pnl}€`, nowIso);
          s.learnings.unshift({ ...e });
          if (s.learnings.length > 300) s.learnings.length = 300;
        });
        if (Math.abs(o.pnl) > 0.8) {
          pushMem(s, {
            id: `mem-${nowIso}-${o.id}`, ts: nowIso, author: ag.name, dept: "trading", pair: o.pair,
            text: `${o.side} ${o.pair} ${o.close_reason} (${o.pnl}€) con ${ag.strategy}. ${o.close_reason.startsWith("SL") ? "Lección: respetar stop y size." : "Funciona: dejar correr con trailing."}`,
            kind: o.pnl > 0 ? "leccion-ganada" : "leccion-perdida",
          });
        }
        const ups = s.learnings.filter(l => l.agent_id === ag.id).slice(0, 3).reduce((x: number, l: any) => x + l.xp, 0);
        if (ups >= 100 && ag.level_risk < 5) { ag.level_risk++; ag.level_ta = Math.min(5, ag.level_ta + 0); }
        ag.last_reason = `${o.side} ${o.pair} cerrada en ${px} (${o.close_reason}) PnL ${o.pnl}€ · ${o.risk_note}`;
      }
      delete s.openOps[o.id];
      s.closed.push(o);
      if (s.closed.length > 250) s.closed.splice(0, s.closed.length - 250);
      s.audit.push({ ts: nowIso, ev: "op.close", id: o.id, agent: o.agent_id, pair: o.pair, pnl: o.pnl, reason: o.close_reason });
      events.push({ type: "operation", op: { ...o } });
    }
  });
}

function desksBlock(s: EngineState, events: any[], lastTick: MarketTick, nowIso: string, rnd: Rng, opId: () => string, msgId: () => string) {
  const arbAgents = Object.values(s.agents).filter((a: any) => a.role === "Arbitrajista");
  const arbAgent = arbAgents[0] || s.agents[s.order[16]];
  const derAgent = Object.values(s.agents).find((a: any) => a.role === "Derivados") || s.agents[s.order[14]];
  const ctxOf = () => ({ equity: s.meta.equity, killSwitch: s.meta.kill, suspended: s.meta.suspended, openOps: Object.values(s.openOps) as any });
  const openArb = Object.values(s.openOps).filter((o: any) => o.status === "abierta" && o.desk === "arbitraje") as any[];
  const prop = scanArb(s.venues, openArb.length, rnd);
  if (prop && !s.meta.kill) {
    const px = (lastTick.prices as any)[prop.pair];
    const arbSize = Math.round(150 / px * 10000) / 10000;
    const va = checkOperation({ id: arbAgent.id, name: arbAgent.name, leverage: 1, pnl: arbAgent.pnl }, { pair: prop.pair, entry: px, size: arbSize, leverage: 1 }, ctxOf());
    if (!va.approved) {
      const bop = { id: opId(), agent_id: arbAgent.id, agent_name: arbAgent.name, desk: "arbitraje", pair: prop.pair, side: "ARB", entry: px, status: "bloqueada", pnl: 0, risk_note: va.reason, opened_at: nowIso };
      s.blocked.push(bop);
      if (s.blocked.length > 80) s.blocked.splice(0, s.blocked.length - 80);
      s.audit.push({ ts: nowIso, ev: "arb.blocked", pair: prop.pair, reason: va.reason });
    } else {
      const op = { id: opId(), agent_id: arbAgent.id, agent_name: arbAgent.name, desk: "arbitraje", pair: prop.pair, side: "ARB", entry: px, spreadOpen: prop.spreadOpen, buyAt: prop.buyAt, size: arbSize, leverage: 1, status: "abierta", pnl: 0, life: 0, maxLife: 12, risk_note: `Arb ${prop.buyAt}→${prop.buyAt === "A" ? "B" : "A"} spread ${prop.spreadOpen}%`, opened_at: nowIso };
      s.openOps[op.id] = op;
      s.audit.push({ ts: nowIso, ev: "arb.open", id: op.id, pair: op.pair, spread: prop.spreadOpen });
      events.push({ type: "operation", op });
    }
  }
  openArb.forEach((o: any) => {
    const sp = spreadOf(s.venues[o.pair]);
    const st = arbPnl(o.spreadOpen, sp, o.pair, o.size * o.entry);
    o.pnl = st.net; o.fees = st.costs; o.life++;
    if (sp < arbCostPct(o.pair) / 2 || o.life >= o.maxLife) {
      o.status = "cerrada"; o.exit = sp; o.closed_at = nowIso;
      o.close_reason = sp < 0.05 ? `spread ${o.spreadOpen}%→${Math.round(sp * 100) / 100}%` : "timeout";
      const ag = s.agents[o.agent_id];
      if (ag) {
        ag.pnl = Math.round((ag.pnl + o.pnl) * 100) / 100; ag.trades_count++;
        s.day.last[ag.id] = o.pnl;
        awardXp(s, ag.id, "tecnico", o.pnl > 0 ? 6 : 3, `Arb ${o.pair} ${o.close_reason} PnL ${o.pnl}€`, nowIso);
      }
      delete s.openOps[o.id];
      s.closed.push(o);
      if (s.closed.length > 250) s.closed.splice(0, s.closed.length - 250);
      s.audit.push({ ts: nowIso, ev: "arb.close", id: o.id, pnl: o.pnl, reason: o.close_reason });
      events.push({ type: "operation", op: { ...o } });
    }
  });
  const openDer = Object.values(s.openOps).filter((o: any) => o.status === "abierta" && o.desk === "derivados");
  if (s.meta.tickN % 4 === 0 && openDer.length < 4 && !s.meta.kill) {
    const pair = rnd() > 0.5 ? "BTC" : "ETH";
    const side = rnd() > 0.5 ? "LONG" : "SHORT";
    const propF = { pair, side, entry: (lastTick.prices as any)[pair], size: Math.round(25 / (lastTick.prices as any)[pair] * 10000) / 10000, leverage: 3 + Math.floor(rnd() * 3) };
    const v = checkOperation({ id: derAgent.id, name: derAgent.name, leverage: derAgent.leverage, pnl: derAgent.pnl }, propF, ctxOf());
    const op: any = {
      id: opId(), agent_id: derAgent.id, agent_name: derAgent.name, strategy: derAgent.strategy, desk: "derivados", kind: "FUTURO", ...propF,
      size: v.size || propF.size, leverage: v.leverage || propF.leverage, status: v.approved ? "abierta" : "bloqueada",
      pnl: 0, life: 0, maxLife: 10, fundingAcc: 0,
      risk_note: v.approved ? `Futuro ${side} (funding ${lastTick.funding}%)` : v.reason, opened_at: nowIso,
    };
    if (v.approved) s.openOps[op.id] = op;
    else { s.blocked.push(op); if (s.blocked.length > 80) s.blocked.splice(0, s.blocked.length - 80); }
    s.audit.push({ ts: nowIso, ev: "deriv.open", id: op.id, pair, side, status: op.status });
    if (v.approved) events.push({ type: "operation", op });
  }
  const sig = hedgeSignal(fundExposure(Object.values(s.openOps) as any, s.meta.equity), s.meta.drawdown);
  const openHedge = Object.values(s.openOps).filter((o: any) => o.status === "abierta" && o.desk === "cobertura") as any[];
  if (sig === "open" && !openHedge.length) {
    const px = (lastTick.prices as any).BTC;
    const riskAgent = s.agents[s.order[1]];
    const op = { id: opId(), agent_id: riskAgent.id, agent_name: riskAgent.name, desk: "cobertura", pair: "BTC", side: "SHORT", entry: px, size: Math.round(s.meta.equity * 0.3 / px * 10000) / 10000, leverage: 1, status: "abierta", pnl: 0, life: 0, maxLife: 30, risk_note: "Mandato Riesgos: hedge cartera", opened_at: nowIso };
    s.openOps[op.id] = op;
    s.audit.push({ ts: nowIso, ev: "hedge.open", id: op.id, equity: Math.round(s.meta.equity) });
    pushMsg(s, events, { id: msgId(), channel_id: "c-general", from_agent_id: riskAgent.id, text: `Cobertura activada: SHORT BTC 30% patrimonio (expo/DD altos).`, kind: "alerta", created_at: nowIso }, riskAgent.name);
    events.push({ type: "operation", op });
  }
  if (sig === "close") openHedge.forEach((o: any) => {
    const px = (lastTick.prices as any).BTC;
    const gross = Math.round(((o.entry - px) / o.entry) * o.size * o.entry * 100) / 100;
    const st = settle(gross, o.size, o.entry, px, costPerSide(o.pair, "spot"));
    o.pnl = st.net; o.fees = st.costs;
    o.status = "cerrada"; o.exit = px; o.closed_at = nowIso; o.close_reason = "riesgo normalizado";
    const ag = s.agents[o.agent_id];
    if (ag) { ag.pnl = Math.round((ag.pnl + o.pnl) * 100) / 100; s.day.last[ag.id] = o.pnl; }
    delete s.openOps[o.id];
    s.closed.push(o);
    if (s.closed.length > 250) s.closed.splice(0, s.closed.length - 250);
    s.audit.push({ ts: nowIso, ev: "hedge.close", id: o.id, pnl: o.pnl });
    events.push({ type: "operation", op: { ...o } });
  });
}

// ---- persistencia KV (load/save) ----

export async function loadEngine(kv: KvStore): Promise<EngineState> {
  const [meta, market, agentsMap, committee, openMap, closed, blocked, msgs, meetings, memory, xp, learnings, strategies, snapshots, audit, targetDays, bufs, venues, eps, departments] = await Promise.all([
    repo.meta(kv), repo.market(kv), repo.agents(kv), repo.committee(kv), repo.openOps(kv),
    repo.closedOps(kv, 300), repo.blockedOps(kv, 100), repo.messages(kv, "c-general", 500),
    repo.meetings(kv), repo.memory(kv, "", 200), repo.xp(kv), repo.learnings(kv, 300),
    repo.strategies(kv), repo.snapshots(kv, 500), repo.audit(kv, 100), repo.targetDays(kv),
    repo.bufs(kv), repo.venues(kv), repo.eps(kv), repo.departments(kv),
  ]);
  const order = Object.keys(agentsMap).sort();
  const dayRaw = await repo.day(kv, (meta as any)?.today || "");
  const unp = (p: string) => {
    const o: Record<string, number> = {};
    for (const [k, v] of Object.entries(dayRaw)) if (k.startsWith(p)) o[k.slice(2)] = Number((v as any)?.value ?? v);
    return o;
  };
  return {
    meta: meta as any, market: market as any, agents: agentsMap as any, order,
    committee: { active: false, topic: "", started_at: null, ticks: 0, backup: {}, log: [], ...(committee as any) },
    day: { trades: unp("t:"), last: unp("l:"), lossTick: unp("c:") },
    openOps: openMap as any, closed: closed as any[], blocked: blocked as any[],
    msgs: msgs as any[], meetings: meetings as any[], memory: memory as any[],
    xp: xp as any, learnings: learnings as any[], strategies: strategies as any,
    snapshots: snapshots as any[], audit: audit as any[], targetDays: targetDays as any,
    bufs: bufs as any, venues: venues as any, eps: eps as any, departments: departments as any[],
  };
}

export async function saveEngine(kv: KvStore, s: EngineState): Promise<void> {
  await repo.saveMeta(kv, s.meta as any);
  await repo.saveMarket(kv, s.market);
  for (const a of Object.values(s.agents)) await repo.saveAgent(kv, a as any);
  await repo.saveCommittee(kv, s.committee);
  const prev = await repo.openOps(kv);
  for (const id of Object.keys(prev)) if (!s.openOps[id]) await repo.delOpenOp(kv, id);
  for (const o of Object.values(s.openOps)) await repo.saveOpenOp(kv, o);
  for (const [id, st] of Object.entries(s.strategies)) await repo.saveStrategy(kv, { id, ...(st as any) });
  await repo.saveBufs(kv, s.bufs);
  await repo.saveVenues(kv, s.venues);
  await repo.saveEps(kv, s.eps);
  for (const [k, v] of Object.entries(s.day.trades)) await repo.saveDay(kv, s.meta.today, `t:${k}`, v);
  for (const [k, v] of Object.entries(s.day.last)) await repo.saveDay(kv, s.meta.today, `l:${k}`, v);
  for (const [k, v] of Object.entries(s.day.lossTick)) await repo.saveDay(kv, s.meta.today, `c:${k}`, v);
}
