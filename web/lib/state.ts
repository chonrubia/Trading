// Repositorio de estado particionado sobre KvStore (diseño council ADR).
// v2 aísla el fondo real: prefijo fund:v2:* y nunca mezcla el estado sintético
// antiguo (fund:*), que queda archivado tal cual.
import type { KvStore } from "./store.js";
import { buildSeed, type Agent, type Department, type Channel } from "./seed.js";
import { newAccount, type Account } from "./accounting.js";
import { STRATEGIES } from "./strategies.js";

export const KEY_PREFIX = "fund:v2:";
export const FUND_BASE = 60;
export const FRESH_MS = 15 * 60_000;
const k = (key: string) => `${KEY_PREFIX}${key}`;

/** La frescura se recalcula al leer: si el cron muere, la UI lo ve. */
export function metaStale(meta: Pick<FundMeta, "stale" | "last_tick_at"> | null | undefined, nowMs = Date.now()): boolean {
  if (!meta || meta.stale !== false) return true;
  const t = Date.parse(meta.last_tick_at || "");
  return !Number.isFinite(t) || nowMs - t > FRESH_MS;
}

export interface FundMeta {
  tickN: number; opN: number; msgN: number; stN: number; today: string;
  dayStartEquity: number; equity: number; peakEquity: number; dayPnl: number; drawdown: number;
  kill: boolean; suspended: string[]; targetAnnounced: boolean;
  engine: "v2"; mode: "paper-real"; market_source: "binance";
  created_at: string; last_tick_at: string; last_candle_ts: string; stale: boolean;
  dayHalt: boolean; halt_reason: string;
}

async function readJson<T>(kv: KvStore, key: string, fallback: T): Promise<T> {
  try {
    const raw = await kv.get(k(key));
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}
const writeJson = (kv: KvStore, key: string, v: unknown) => kv.set(k(key), JSON.stringify(v));

async function readHash<T>(kv: KvStore, key: string): Promise<Record<string, T>> {
  const raw = await kv.hgetall(k(key));
  const o: Record<string, T> = {};
  for (const [f, v] of Object.entries(raw)) {
    try { o[f] = JSON.parse(v) as T; } catch { /* skip corrupto */ }
  }
  return o;
}

async function pushTrim(kv: KvStore, key: string, item: unknown, cap: number): Promise<void> {
  await kv.rpush(k(key), JSON.stringify(item));
  const n = await kv.llen(k(key));
  if (n > cap) await kv.ltrim(k(key), n - cap, -1);
}

async function readList<T>(kv: KvStore, key: string, limit = 100): Promise<T[]> {
  const raw = await kv.lrange(k(key), -limit, -1);
  const out: T[] = [];
  for (const s of raw) {
    try { out.push(JSON.parse(s) as T); } catch { /* skip */ }
  }
  return out;
}

export async function ensureSeed(kv: KvStore, nowIso: string): Promise<boolean> {
  if (await kv.get(k("meta"))) return false;
  const { departments, agents, channels } = buildSeed();
  const today = nowIso.slice(0, 10);
  const meta: FundMeta = {
    tickN: 0, opN: 1, msgN: 5, stN: 1, today,
    dayStartEquity: FUND_BASE, equity: FUND_BASE, peakEquity: FUND_BASE, dayPnl: 0, drawdown: 0,
    kill: false, suspended: [], targetAnnounced: false,
    engine: "v2", mode: "paper-real", market_source: "binance",
    created_at: nowIso, last_tick_at: "", last_candle_ts: "", stale: true,
    dayHalt: false, halt_reason: "",
  };
  await writeJson(kv, "meta", meta);
  await writeJson(kv, "account", newAccount(FUND_BASE));
  await writeJson(kv, "market", {
    source: "binance", prices: {}, change24h: {}, funding: 0, fear_greed: 50,
    risk_mode: "RISK-OFF", regime: "range", trend: {}, ts: nowIso,
    lastCandleTs: "", stale: true, lastTick: null,
  });
  for (const a of agents) await kv.hset(k("agents"), a.id, JSON.stringify(a));
  await writeJson(kv, "committee", { active: false, topic: "", started_at: null, ticks: 0, backup: {}, log: [] });
  const seedMsgs = [
    { id: "m-1", channel_id: "c-general", from_agent_id: agents[14].id, text: "Fondo v2 en papel con datos reales de Binance. Aún no hay ninguna vela procesada.", kind: "alerta", created_at: nowIso },
    { id: "m-2", channel_id: "c-general", from_agent_id: agents[15].id, text: "Sin precios inventados: si Binance no responde, el motor se detiene.", kind: "idea", created_at: nowIso },
  ];
  for (const m of seedMsgs) await kv.rpush(k("msgs"), JSON.stringify(m));
  await writeJson(kv, "depts", departments);
  await writeJson(kv, "channels", channels);
  for (const s of STRATEGIES) {
    await kv.hset(k("strategies"), s.name, JSON.stringify({
      id: s.name, name: s.name, pair: s.pair, tf: s.tf, style: s.style,
      kind: s.kind, p1: s.p1, p2: s.p2, status: "activa",
      created_at: nowIso, backtest: null, validation: null,
    }));
  }
  return true;
}

export const repo = {
  meta: (kv: KvStore) => readJson<FundMeta>(kv, "meta", null as unknown as FundMeta),
  saveMeta: (kv: KvStore, m: FundMeta) => writeJson(kv, "meta", m),
  account: (kv: KvStore) => readJson<Account>(kv, "account", newAccount(FUND_BASE)),
  saveAccount: (kv: KvStore, a: Account) => writeJson(kv, "account", a),
  market: (kv: KvStore) => readJson<any>(kv, "market", null),
  saveMarket: (kv: KvStore, m: any) => writeJson(kv, "market", m),
  agents: (kv: KvStore) => readHash<Agent>(kv, "agents"),
  saveAgent: (kv: KvStore, a: Agent) => kv.hset(k("agents"), a.id, JSON.stringify(a)),
  departments: (kv: KvStore) => readJson<Department[]>(kv, "depts", []),
  channels: (kv: KvStore) => readJson<Channel[]>(kv, "channels", []),
  committee: (kv: KvStore) => readJson<any>(kv, "committee", { active: false }),
  saveCommittee: (kv: KvStore, c: any) => writeJson(kv, "committee", c),
  day: (kv: KvStore, date: string) => readHash<any>(kv, `day:${date}`),
  saveDay: (kv: KvStore, date: string, field: string, v: any) => kv.hset(k(`day:${date}`), field, JSON.stringify(v)),
  openOps: (kv: KvStore) => readHash<any>(kv, "ops:open"),
  saveOpenOp: (kv: KvStore, o: any) => kv.hset(k("ops:open"), o.id, JSON.stringify(o)),
  delOpenOp: (kv: KvStore, id: string) => kv.hdel(k("ops:open"), id),
  closedOps: (kv: KvStore, n = 100) => readList<any>(kv, "ops:closed", n),
  pushClosed: (kv: KvStore, o: any) => pushTrim(kv, "ops:closed", o, 2000),
  blockedOps: (kv: KvStore, n = 100) => readList<any>(kv, "ops:blocked", n),
  pushBlocked: (kv: KvStore, o: any) => pushTrim(kv, "ops:blocked", o, 200),
  messages: (kv: KvStore, channel: string, n = 50) => readList<any>(kv, "msgs", 1000).then(all => all.filter((m: any) => m.channel_id === channel).slice(-n)),
  pushMsg: (kv: KvStore, m: any) => pushTrim(kv, "msgs", m, 1000),
  allMsgs: (kv: KvStore) => readList<any>(kv, "msgs", 1000),
  meetings: (kv: KvStore) => readList<any>(kv, "meetings", 20),
  pushMeeting: (kv: KvStore, m: any) => pushTrim(kv, "meetings", m, 20),
  memory: (kv: KvStore, q: string, n = 30) => readList<any>(kv, "memory", 300).then(all => {
    const list = q ? all.filter((e: any) => `${e.text} ${e.pair} ${e.author} ${e.kind}`.toLowerCase().includes(q.toLowerCase())) : all;
    return list.slice(-n).reverse();
  }),
  pushMemory: (kv: KvStore, e: any) => pushTrim(kv, "memory", e, 300),
  xp: (kv: KvStore) => readHash<any>(kv, "xp"),
  saveXp: (kv: KvStore, agentId: string, v: any) => kv.hset(k("xp"), agentId, JSON.stringify(v)),
  awardXp: async (kv: KvStore, agentId: string, subject: string, amount: number) => {
    const all = await readHash<any>(kv, "xp");
    const cur = all[agentId] || {};
    cur[subject] = (cur[subject] || 0) + amount;
    await kv.hset(k("xp"), agentId, JSON.stringify(cur));
    return cur;
  },
  learnings: (kv: KvStore, n = 50) => readList<any>(kv, "learnings", n),
  pushLearning: (kv: KvStore, l: any) => pushTrim(kv, "learnings", l, 300),
  strategies: (kv: KvStore) => readHash<any>(kv, "strategies"),
  saveStrategy: (kv: KvStore, s: any) => kv.hset(k("strategies"), s.id || s.name, JSON.stringify(s)),
  snapshots: (kv: KvStore, n = 100) => readList<any>(kv, "snapshots", n),
  pushSnapshot: (kv: KvStore, s: any) => pushTrim(kv, "snapshots", s, 10000),
  audit: (kv: KvStore, n = 50) => readList<any>(kv, "audit", n),
  pushAudit: (kv: KvStore, e: any) => pushTrim(kv, "audit", e, 300),
  targetDays: (kv: KvStore) => readHash<any>(kv, "target_days"),
  saveTargetDay: (kv: KvStore, day: string, v: any) => kv.hset(k("target_days"), day, JSON.stringify(v)),
  bufs: (kv: KvStore) => readJson<any>(kv, "bufs", {}),
  saveBufs: (kv: KvStore, b: any) => writeJson(kv, "bufs", b),
  venues: (kv: KvStore) => readJson<any>(kv, "venues", {}),
  saveVenues: (kv: KvStore, v: any) => writeJson(kv, "venues", v),
  eps: (kv: KvStore) => readJson<any>(kv, "eps", {}),
  saveEps: (kv: KvStore, e: any) => writeJson(kv, "eps", e),
  liveArm: (kv: KvStore) => readJson<any>(kv, "live:arm", { armed: false }),
  saveLiveArm: (kv: KvStore, v: any) => writeJson(kv, "live:arm", v),
};
