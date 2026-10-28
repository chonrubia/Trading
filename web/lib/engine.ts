// Motor v2 por pasos. Sin I/O, sin Math.random/Date directos: todo via input.
// El mercado entra como snapshot real de Binance; si está stale no se avanza.
// Solo spot LONG 1x. Las señales SHORT cierran el LONG, nunca abren corto.
import type { Rng } from "./rng.js";
import { checkSpotOperation, SPOT_LIMITS } from "./risk.js";
import { xpForClose, award } from "./school.js";
import type { KvStore } from "./store.js";
import { repo, type FundMeta } from "./state.js";
import {
  newAccount, openPosition, closePosition, markPosition, summarize,
  round2, type Account, type Position, type ClosedTrade,
} from "./accounting.js";
import { candlesFor, marketSummary, type RealMarket } from "./market-real.js";
import { specFor, stopsFor, maxLifeFor, buildSeries, signalAtSeries, type StrategySpec, type StrategySeries } from "./strategies.js";

export const ENGINE = "v2" as const;
export const MODE = "paper-real" as const;
export const DAILY_TARGET_EUR = 1.2;

export interface EngineState {
  meta: FundMeta;
  market: any;
  account: Account;
  agents: Record<string, any>;
  order: string[];
  committee: { active: boolean; topic: string; started_at: string | null; ticks: number; backup: Record<string, { x: number; y: number }>; log: string[] };
  day: { trades: Record<string, number>; last: Record<string, number>; lossTick: Record<string, number>; explore: Record<string, number> };
  openOps: Record<string, Position>;
  closed: ClosedTrade[];
  blocked: any[];
  msgs: any[]; meetings: any[]; memory: any[]; xp: Record<string, any>; learnings: any[];
  strategies: Record<string, any>; snapshots: any[]; audit: any[]; targetDays: Record<string, any>;
  bufs: Record<string, number[]>;
  departments: any[];
}

export interface StepInput { slot: string; nowIso: string; rnd: Rng; market: RealMarket }

const IDEAS = [
  "Precio real de {P} en {PX}€. Señal {S}; sin forzar.",
  "Vela cerrada de {P}: {C}% en 24h. Contexto {R}.",
  "{P} cotiza {PX}€. Funding {F}% (informativo, spot no lo paga).",
  "Miro {P}: tendencia {T}. Solo compro si la señal acompaña.",
  "Sin operación en {P}. Mejor no inventar una excusa para entrar.",
  "Riesgo primero: si el stop no cabe en 10€, no hay trade.",
];

function agentMsg(a: any, rnd: Rng, market: RealMarket): string {
  const px = market.prices[a.pair] ?? 0;
  const chg = market.change24h[a.pair] ?? 0;
  const t = IDEAS[Math.floor(rnd() * IDEAS.length)];
  return t.replace("{P}", a.pair)
    .replace("{PX}", String(px))
    .replace("{S}", String(a.strategy).split(" ")[0])
    .replace("{C}", String(chg))
    .replace("{R}", market.risk_mode)
    .replace("{F}", String(market.funding))
    .replace("{T}", (market.trend?.[a.pair] ?? 0) > 0 ? "alcista" : "bajista");
}
function pushMem(s: EngineState, e: any) {
  s.memory.unshift(e);
  if (s.memory.length > 300) s.memory.length = 300;
}
function pushMsg(s: EngineState, events: any[], m: any, fromName: string) {
  s.msgs.push(m);
  if (s.msgs.length > 1000) s.msgs.splice(0, s.msgs.length - 1000);
  events.push({ type: "chat", msg: { ...m, from: fromName } });
}
function awardXp(s: EngineState, agentId: string, subject: string, amount: number, note: string, ts: string) {
  const e = award(s.xp, agentId, subject, amount, note, ts);
  s.learnings.unshift(e);
  if (s.learnings.length > 300) s.learnings.length = 300;
}

function seriesKey(spec: StrategySpec): string {
  return `${spec.pair}|${spec.tf}|${spec.kind}|${spec.p1}|${spec.p2 || 0}`;
}

function committeeSummary(s: EngineState, nowIso: string, summary: ReturnType<typeof summarize>) {
  const top = Object.values(s.agents).filter((a: any) => a.role === "Trader").sort((a: any, b: any) => b.pnl - a.pnl).slice(0, 3);
  return {
    topic: s.committee.topic, ended_at: nowIso,
    patrimonio: summary.equity, dayPnl: s.meta.dayPnl,
    exposure: summary.exposurePct,
    top3: top.map((t: any) => ({ name: t.name, setup: t.strategy, pnl: round2(t.pnl) })),
    decisions: [
      `Spot 1x: exposición ${summary.exposurePct}% y ${Object.keys(s.openOps).length}/${SPOT_LIMITS.max_positions} posiciones`,
      top[0] ? `Refuerzo a ${top[0].name} (${top[0].strategy}) por liderar ranking` : "Sin datos de ranking",
      `Datos Binance: ${s.meta.last_candle_ts || "sin vela"} · ${s.meta.stale ? "STALE" : "frescos"}`,
    ],
    messages: s.committee.log.length,
  };
}

function endCommittee(s: EngineState, events: any[], nowIso: string, auto: boolean, summary: ReturnType<typeof summarize>) {
  if (!s.committee.active) return null;
  s.committee.active = false;
  for (const [id, p] of Object.entries(s.committee.backup)) {
    const a = s.agents[id];
    if (a) { a.tx = p.x; a.ty = p.y; a.status = "analizando"; }
  }
  const out = committeeSummary(s, nowIso, summary);
  s.meetings.unshift({ id: `meet-${nowIso}-${auto ? "a" : "m"}`, ...out, auto });
  if (s.meetings.length > 20) s.meetings.length = 20;
  pushMem(s, { id: `mem-c-${nowIso}`, ts: nowIso, author: "Dirección CIO", dept: "direccion", pair: "FONDO", text: `Comité: ${out.decisions.join(" · ")}`, kind: "comite" });
  s.audit.push({ ts: nowIso, ev: "committee.end", topic: out.topic, auto, top: out.top3.map((t: any) => t.name) });
  const first = s.agents[s.order[0]];
  pushMsg(s, events, { id: `m-cend-${nowIso}`, channel_id: "c-general", from_agent_id: first.id, text: `Comité cerrado. ${out.decisions.join(" · ")}`, kind: "alerta", created_at: nowIso }, first.name);
  events.push({ type: "committee", phase: "ended", summary: out });
  return out;
}

function updateAgentStats(s: EngineState, agentId: string) {
  const ag = s.agents[agentId];
  if (!ag) return;
  const list = s.closed.filter(o => o.agent_id === agentId);
  ag.trades_count = list.length;
  ag.pnl = round2(list.reduce((x, o) => x + (o.pnl || 0), 0));
  const wins = list.filter(o => o.pnl > 0).length;
  ag.win_rate = list.length ? Math.round((wins / list.length) * 1000) / 10 : 0;
  const gp = list.filter(o => o.pnl > 0).reduce((x, o) => x + o.pnl, 0);
  const gl = Math.abs(list.filter(o => o.pnl <= 0).reduce((x, o) => x + o.pnl, 0));
  ag.profit_factor = gl > 0 ? Math.round((gp / gl) * 100) / 100 : gp > 0 ? 99 : 0;
  let eq = 0, peak = 0, dd = 0;
  for (const o of list) { eq += o.pnl; peak = Math.max(peak, eq); dd = Math.max(dd, peak - eq); }
  ag.drawdown = round2(dd);
}

function updateStrategyStats(s: EngineState, nowIso: string) {
  for (const st of Object.values(s.strategies) as any[]) {
    if (!st?.name) continue;
    const list = s.closed.filter(o => o.strategy === st.name);
    if (!list.length) continue;
    const wins = list.filter(o => o.pnl > 0);
    const gp = wins.reduce((x, o) => x + o.pnl, 0);
    const gl = Math.abs(list.filter(o => o.pnl <= 0).reduce((x, o) => x + o.pnl, 0));
    st.live = {
      trades: list.length, net: round2(list.reduce((x, o) => x + o.pnl, 0)),
      win_rate: Math.round((wins.length / list.length) * 1000) / 10,
      profit_factor: gl > 0 ? Math.round((gp / gl) * 100) / 100 : gp > 0 ? 99 : 0,
      updated_at: nowIso,
    };
  }
}

function closeTrade(
  s: EngineState, events: any[], p: Position, px: number, reason: string,
  nowIso: string, summary: ReturnType<typeof summarize> | null
) {
  const out = closePosition(s.account, p, px, reason, nowIso);
  s.account = out.account;
  const tr = out.trade;
  const ag = s.agents[tr.agent_id];
  if (ag) {
    ag.status = "analizando";
    ag.last_reason = `LONG ${tr.pair} cerrada (${tr.close_reason}) PnL ${tr.pnl}€ · spot 1x`;
    s.day.last[ag.id] = tr.pnl;
    if (tr.pnl < 0) s.day.lossTick[ag.id] = s.meta.tickN;
    xpForClose(tr.pnl).forEach((g: any) => awardXp(s, ag.id, g.s, g.x, `LONG ${tr.pair} ${tr.close_reason} PnL ${tr.pnl}€`, nowIso));
    if (tr.close_reason !== "timeout" || Math.abs(tr.pnl) > 0.05) {
      pushMem(s, {
        id: `mem-${nowIso}-${tr.id}`, ts: nowIso, author: ag.name, dept: "trading", pair: tr.pair,
        text: `LONG ${tr.pair} ${tr.close_reason} (${tr.pnl}€). Costes ${tr.fees}€. ${tr.pnl > 0 ? "Dejar correr funcionó." : "Stop respetado; no promediar."}`,
        kind: tr.pnl > 0 ? "leccion-ganada" : "leccion-perdida",
      });
    }
  }
  delete s.openOps[tr.id];
  s.closed.push(tr);
  if (s.closed.length > 2000) s.closed.splice(0, s.closed.length - 2000);
  s.audit.push({ ts: nowIso, ev: "op.close", id: tr.id, agent: tr.agent_id, pair: tr.pair, pnl: tr.pnl, fees: tr.fees, reason: tr.close_reason });
  events.push({ type: "operation", op: { ...tr } });
  if (ag) updateAgentStats(s, ag.id);
}

export function step(s: EngineState, input: StepInput): { state: EngineState; events: any[] } {
  const { slot, nowIso, rnd, market } = input;
  if (!market || market.stale || !Object.keys(market.prices || {}).length) {
    throw new Error("datos de mercado reales ausentes o stale: tick abortado");
  }
  const events: any[] = [];
  let k = 0;
  const opId = () => `op-${slot}-${k++}`;
  const msgId = () => `m-${slot}-${k++}`;
  const meta = s.meta;
  meta.tickN++;
  meta.last_tick_at = nowIso;
  meta.last_candle_ts = market.lastCandleTs;
  meta.stale = market.stale;
  meta.engine = "v2"; meta.mode = "paper-real"; meta.market_source = "binance";

  s.market = marketSummary(market);
  for (const pair of Object.keys(market.prices)) {
    const closes = candlesFor(market, pair, "1h").slice(-150).map(c => c.close);
    s.bufs[pair] = closes;
  }

  // 1) rollover diario (antes de operar)
  let summary = summarize(s.account, Object.values(s.openOps), market.prices);
  const dk = nowIso.slice(0, 10);
  if (dk !== meta.today) {
    const yPnl = round2(meta.equity - meta.dayStartEquity);
    const yTrades = s.closed.filter(o => o.closed_at?.slice(0, 10) === meta.today).length;
    s.targetDays[meta.today] = { pnl: yPnl, trades: yTrades, equity: meta.equity, hit: yPnl >= DAILY_TARGET_EUR };
    s.audit.push({ ts: nowIso, ev: "day.close", day: meta.today, pnl: yPnl, trades: yTrades });
    meta.today = dk; meta.dayStartEquity = summary.equity; meta.targetAnnounced = false;
    meta.dayHalt = false; meta.halt_reason = "";
    s.day = { trades: {}, last: {}, lossTick: {}, explore: {} };
  }

  // 2) patrimonio y frenos duros
  meta.equity = summary.equity;
  meta.peakEquity = Math.max(meta.peakEquity, meta.equity);
  meta.drawdown = meta.peakEquity ? Math.round(((meta.peakEquity - meta.equity) / meta.peakEquity) * 10000) / 100 : 0;
  meta.dayPnl = round2(meta.equity - meta.dayStartEquity);
  if (meta.dayPnl <= -SPOT_LIMITS.max_day_loss && !meta.dayHalt) {
    meta.dayHalt = true; meta.halt_reason = `pérdida diaria ${meta.dayPnl}€ ≤ -${SPOT_LIMITS.max_day_loss}€`;
    s.audit.push({ ts: nowIso, ev: "risk.dayHalt", dayPnl: meta.dayPnl });
    const rman = Object.values(s.agents).find((a: any) => /Risk Manager/i.test(a.role)) || s.agents[s.order[1]];
    pushMsg(s, events, { id: msgId(), channel_id: "c-general", from_agent_id: rman.id, text: `Freno diario: ${meta.halt_reason}. No se abre nada más hasta mañana.`, kind: "alerta", created_at: nowIso }, rman.name);
  }
  if (meta.drawdown >= SPOT_LIMITS.max_drawdown && !meta.kill) {
    meta.kill = true; meta.halt_reason = `drawdown ${meta.drawdown}% ≥ ${SPOT_LIMITS.max_drawdown}%`;
    s.audit.push({ ts: nowIso, ev: "risk.drawdownKill", drawdown: meta.drawdown });
  }
  if (meta.dayPnl >= DAILY_TARGET_EUR && !meta.targetAnnounced) {
    meta.targetAnnounced = true;
    s.audit.push({ ts: nowIso, ev: "target.hit", dayPnl: meta.dayPnl });
  }

  // 3) señales y gestión de posiciones abiertas
  const seriesCache = new Map<string, StrategySeries>();
  const getSeries = (spec: StrategySpec): StrategySeries => {
    const key = seriesKey(spec);
    let ser = seriesCache.get(key);
    if (!ser) { ser = buildSeries(spec, candlesFor(market, spec.pair, spec.tf)); seriesCache.set(key, ser); }
    return ser;
  };
  const openList = Object.values(s.openOps);
  for (const raw of openList) {
    const px = market.prices[raw.pair] || raw.entry;
    const marked = markPosition({ ...raw, life: (raw.life || 0) + 1 }, px);
    const spec = specFor(raw.strategy, raw.pair, "1h");
    const ser = getSeries(spec);
    const sig = ser.closes.length ? signalAtSeries(ser) : "FLAT";
    const reason = meta.kill ? "kill switch"
      : px <= marked.stop ? "SL"
        : px >= marked.target ? "TP"
          : marked.life >= marked.maxLife ? "timeout"
            : sig === "SHORT" ? "señal SHORT" : "";
    if (reason) {
      closeTrade(s, events, marked, px, reason, nowIso, summary);
    } else {
      s.openOps[marked.id] = marked;
    }
  }

  // 4) aperturas: solo LONG spot 1x, máximo 3 posiciones y 10€/orden
  summary = summarize(s.account, Object.values(s.openOps), market.prices);
  const order = [...s.order];
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = order[i]; order[i] = order[j]; order[j] = t; }
  if (!meta.kill && !meta.dayHalt) {
    for (const id of order) {
      if (Object.keys(s.openOps).length >= SPOT_LIMITS.max_positions) break;
      const a = s.agents[id];
      if (!a || a.role !== "Trader") continue;
      if (meta.suspended.includes(a.id)) continue;
      if (Object.values(s.openOps).some(o => o.agent_id === a.id)) continue;
      if (Object.values(s.openOps).some(o => o.pair === a.pair)) continue;
      const spec = specFor(a.strategy, a.pair, a.timeframe);
      const candles = candlesFor(market, spec.pair, spec.tf);
      if (candles.length < Math.max(30, spec.p1 + 2, spec.p2 || 0)) continue;
      const ser = getSeries(spec);
      if (signalAtSeries(ser) !== "LONG") continue;
      const px = market.prices[spec.pair];
      if (!(px > 0)) continue;
      const notional = Math.min(SPOT_LIMITS.max_order_eur, Math.max(SPOT_LIMITS.min_order_eur, round2(summary.cash * 0.25)));
      const verdict = checkSpotOperation({
        pair: spec.pair, side: "LONG", notional, price: px,
        openCount: Object.keys(s.openOps).length, cash: summary.cash,
        dayPnl: meta.dayPnl, exposurePct: summary.exposurePct, drawdown: meta.drawdown,
        suspended: false, killSwitch: meta.kill, dayHalt: meta.dayHalt,
      });
      if (!verdict.approved) {
        s.blocked.push({
          id: opId(), agent_id: a.id, agent_name: a.name, strategy: a.strategy,
          pair: spec.pair, side: "LONG", entry: px, size: notional / px, leverage: 1,
          status: "bloqueada", pnl: 0, risk_note: verdict.reason, opened_at: nowIso,
        });
        if (s.blocked.length > 200) s.blocked.splice(0, s.blocked.length - 200);
        continue;
      }
      const st = stopsFor(px, ser.atr, 1);
      const req = {
        id: opId(), agent_id: a.id, agent_name: a.name, strategy: a.strategy,
        pair: spec.pair, mid: px, notional, stop: st.stop, target: st.target,
        maxLife: maxLifeFor(spec.tf), opened_at: nowIso,
      };
      let opened: { account: Account; position: Position };
      try { opened = openPosition(s.account, req); } catch { continue; }
      s.account = opened.account;
      s.openOps[opened.position.id] = opened.position;
      summary = summarize(s.account, Object.values(s.openOps), market.prices);
      a.status = "operando";
      a.last_reason = `LONG ${spec.pair} a ${round2(px)}€ · stop ${round2(st.stop)}€ · target ${round2(st.target)}€ · ${notional}€ spot 1x`;
      s.day.trades[a.id] = (s.day.trades[a.id] || 0) + 1;
      s.audit.push({ ts: nowIso, ev: "op.open", id: opened.position.id, agent: a.id, pair: spec.pair, notional, stop: round2(st.stop), target: round2(st.target) });
      events.push({ type: "operation", op: { ...opened.position } });
      pushMsg(s, events, {
        id: msgId(), channel_id: "c-general", from_agent_id: a.id,
        text: `LONG ${spec.pair} spot 1x · ${notional}€ a ${round2(px)}€. Stop ${round2(st.stop)}€, target ${round2(st.target)}€. ${spec.name}.`,
        kind: "alerta", created_at: nowIso,
      }, a.name);
    }
  }

  // 5) comité / conversación (siempre con precios reales)
  s.committee.ticks += s.committee.active ? 1 : 0;
  for (const id of s.order) {
    const a = s.agents[id];
    if (a.tx !== undefined) { a.x += (a.tx - a.x) * 0.25; a.y += (a.ty - a.y) * 0.25; }
  }
  summary = summarize(s.account, Object.values(s.openOps), market.prices);
  if (s.committee.active) {
    const staff = s.order.slice(0, 8).map(id => s.agents[id]);
    const top = Object.values(s.agents).filter((a: any) => a.role === "Trader").sort((a: any, b: any) => b.pnl - a.pnl).slice(0, 3);
    const pool = [...staff, ...top];
    const sp = pool[Math.floor(rnd() * pool.length)];
    const texts = [
      `Datos reales: ${sp.pair} a ${market.prices[sp.pair]}€ (${market.change24h[sp.pair] ?? 0}% 24h).`,
      `Riesgos: exposición ${summary.exposurePct}%, ${Object.keys(s.openOps).length}/${SPOT_LIMITS.max_positions} posiciones spot 1x.`,
      `Macro ${market.risk_mode}: funding ${market.funding}%, Fear&Greed ${market.fear_greed}.`,
      `Solo LONG spot. Si la señal es SHORT, cerramos; no abrimos cortos.`,
      `Cada orden máxima 10€. El capital real previsto es 50-60€.`,
    ];
    const msg = { id: msgId(), channel_id: "c-general", from_agent_id: sp.id, text: texts[Math.floor(rnd() * texts.length)], kind: "analisis", created_at: nowIso };
    pushMsg(s, events, msg, sp.name);
    s.committee.log.push(msg.id);
    if (s.committee.ticks >= 10) endCommittee(s, events, nowIso, true, summary);
  } else {
    for (let i = 0; i < (rnd() > 0.45 ? 1 : 2); i++) {
      const a = s.agents[s.order[Math.floor(rnd() * s.order.length)]];
      if (!a) continue;
      a.status = a.status === "operando" ? "operando" : "hablando";
      const base = agentMsg(a, rnd, market);
      pushMsg(s, events, { id: msgId(), channel_id: "c-general", from_agent_id: a.id, text: base, kind: "idea", created_at: nowIso }, a.name);
    }
  }

  // 6) contabilidad final del tick
  summary = summarize(s.account, Object.values(s.openOps), market.prices);
  meta.equity = summary.equity;
  meta.dayPnl = round2(meta.equity - meta.dayStartEquity);
  meta.peakEquity = Math.max(meta.peakEquity, meta.equity);
  meta.drawdown = meta.peakEquity ? Math.round(((meta.peakEquity - meta.equity) / meta.peakEquity) * 10000) / 100 : 0;
  updateStrategyStats(s, nowIso);
  s.snapshots.push({
    ts: nowIso, equity: meta.equity, dayPnl: meta.dayPnl, drawdown: meta.drawdown,
    exposure: summary.exposurePct, cash: summary.cash, realized: summary.realized,
    unrealized: summary.unrealized, positions: Object.keys(s.openOps).length,
    trades: s.closed.length, fees: summary.feesPaid,
  });
  if (s.snapshots.length > 10000) s.snapshots.splice(0, s.snapshots.length - 10000);
  events.push({
    type: "tick", tick: s.market.lastTick, equity: meta.equity, dayPnl: meta.dayPnl,
    drawdown: meta.drawdown, exposure: summary.exposurePct, kill: meta.kill,
    committee: s.committee.active, realized: summary.realized, unrealized: summary.unrealized,
  });
  return { state: s, events };
}

// ---- persistencia KV (load/save) ----

export async function loadEngine(kv: KvStore): Promise<EngineState> {
  const [meta, account, market, agentsMap, committee, openMap, closed, blocked, msgs, meetings, memory, xp, learnings, strategies, snapshots, audit, targetDays, bufs, departments] = await Promise.all([
    repo.meta(kv), repo.account(kv), repo.market(kv), repo.agents(kv), repo.committee(kv), repo.openOps(kv),
    repo.closedOps(kv, 2000), repo.blockedOps(kv, 200), repo.messages(kv, "c-general", 1000),
    repo.meetings(kv), repo.memory(kv, "", 300), repo.xp(kv), repo.learnings(kv, 300),
    repo.strategies(kv), repo.snapshots(kv, 10000), repo.audit(kv, 300), repo.targetDays(kv),
    repo.bufs(kv), repo.departments(kv),
  ]);
  const order = Object.keys(agentsMap).sort();
  const dayRaw = await repo.day(kv, (meta as any)?.today || "");
  const unp = (p: string) => {
    const o: Record<string, number> = {};
    for (const [f, v] of Object.entries(dayRaw)) if (f.startsWith(p)) o[f.slice(2)] = Number((v as any)?.value ?? v);
    return o;
  };
  return {
    meta: meta as any,
    account: account || newAccount(60),
    market: market as any, agents: agentsMap as any, order,
    committee: { active: false, topic: "", started_at: null, ticks: 0, backup: {}, log: [], ...(committee as any) },
    day: { trades: unp("t:"), last: unp("l:"), lossTick: unp("c:"), explore: unp("e:") },
    openOps: openMap as any, closed: closed as any[], blocked: blocked as any[],
    msgs: msgs as any[], meetings: meetings as any[], memory: memory as any[],
    xp: xp as any, learnings: learnings as any[], strategies: strategies as any,
    snapshots: snapshots as any[], audit: audit as any[], targetDays: targetDays as any,
    bufs: bufs as any, departments: departments as any[],
  };
}

export async function saveEngine(kv: KvStore, s: EngineState): Promise<void> {
  await repo.saveMeta(kv, s.meta);
  await repo.saveAccount(kv, s.account);
  await repo.saveMarket(kv, s.market);
  // Dirty-check de agentes: 176 × cada tick fundiría la cuota gratis.
  const r3 = (v: any) => (typeof v === "number" ? Math.round(v * 1000) / 1000 : v);
  const stableAgent = (a: any) => ({ ...a, x: r3(a.x), y: r3(a.y) });
  const storedAgents = await repo.agents(kv);
  for (const a of Object.values(s.agents) as any[]) {
    const cur = (storedAgents as any)[a.id];
    if (!cur || JSON.stringify(stableAgent(cur)) !== JSON.stringify(stableAgent(a))) await repo.saveAgent(kv, a as any);
  }
  await repo.saveCommittee(kv, s.committee);
  const prev = await repo.openOps(kv);
  for (const id of Object.keys(prev)) if (!s.openOps[id]) await repo.delOpenOp(kv, id);
  for (const o of Object.values(s.openOps)) await repo.saveOpenOp(kv, o);
  const storedStrats = await repo.strategies(kv);
  for (const [id, st] of Object.entries(s.strategies)) {
    const full = { ...(st as any), id };
    if (!((storedStrats as any)[id]) || JSON.stringify((storedStrats as any)[id]) !== JSON.stringify(full)) await repo.saveStrategy(kv, full);
  }
  await repo.saveBufs(kv, s.bufs);
  for (const [f, v] of Object.entries(s.day.trades)) await repo.saveDay(kv, s.meta.today, `t:${f}`, v);
  for (const [f, v] of Object.entries(s.day.last)) await repo.saveDay(kv, s.meta.today, `l:${f}`, v);
  for (const [f, v] of Object.entries(s.day.lossTick)) await repo.saveDay(kv, s.meta.today, `c:${f}`, v);
  for (const [f, v] of Object.entries(s.day.explore)) await repo.saveDay(kv, s.meta.today, `e:${f}`, v);

  const idSet = (xs: any[]) => new Set(xs.map(x => x.id).filter(Boolean));
  const jsonKey = (x: any) => JSON.stringify(x);
  const storedClosed = await repo.closedOps(kv, 10000);
  const seenClosed = idSet(storedClosed);
  for (const o of s.closed) if (o.id && !seenClosed.has(o.id)) { await repo.pushClosed(kv, o); seenClosed.add(o.id); }
  const storedBlocked = await repo.blockedOps(kv, 10000);
  const seenBlocked = idSet(storedBlocked);
  for (const o of s.blocked) if (o.id && !seenBlocked.has(o.id)) { await repo.pushBlocked(kv, o); seenBlocked.add(o.id); }
  const storedMsgs = await repo.allMsgs(kv);
  const seenMsgs = idSet(storedMsgs);
  for (const m of s.msgs) if (m.id && !seenMsgs.has(m.id)) { await repo.pushMsg(kv, m); seenMsgs.add(m.id); }
  const storedMeetings = await repo.meetings(kv);
  const seenMeetings = idSet(storedMeetings);
  for (const m of [...s.meetings].reverse()) if (m.id && !seenMeetings.has(m.id)) { await repo.pushMeeting(kv, m); seenMeetings.add(m.id); }
  const storedMemory = await repo.memory(kv, "", 10000);
  const seenMemory = idSet(storedMemory);
  for (const e of [...s.memory].reverse()) {
    const id = e.id ?? jsonKey(e);
    if (!seenMemory.has(id)) { await repo.pushMemory(kv, e); seenMemory.add(id); }
  }
  const storedLearnings = await repo.learnings(kv, 10000);
  const seenLearnings = new Set(storedLearnings.map(jsonKey));
  for (const l of [...s.learnings].reverse()) { const key = jsonKey(l); if (!seenLearnings.has(key)) { await repo.pushLearning(kv, l); seenLearnings.add(key); } }
  const storedSnaps = await repo.snapshots(kv, 10000);
  const seenSnaps = new Set(storedSnaps.map((x: any) => x.ts));
  for (const x of s.snapshots) if (x.ts && !seenSnaps.has(x.ts)) { await repo.pushSnapshot(kv, x); seenSnaps.add(x.ts); }
  const storedAudit = await repo.audit(kv, 10000);
  const seenAudit = new Set(storedAudit.map(jsonKey));
  for (const e of s.audit) { const key = jsonKey(e); if (!seenAudit.has(key)) { await repo.pushAudit(kv, e); seenAudit.add(key); } }
  const storedXp = await repo.xp(kv);
  for (const [agentId, v] of Object.entries(s.xp)) if (jsonKey(v) !== jsonKey((storedXp as any)[agentId])) await repo.saveXp(kv, agentId, v);
  const storedDays = await repo.targetDays(kv);
  for (const [day, v] of Object.entries(s.targetDays)) if (jsonKey(v) !== jsonKey((storedDays as any)[day])) await repo.saveTargetDay(kv, day, v);
}
