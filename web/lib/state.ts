// Repositorio de estado particionado sobre KvStore (diseño council ADR).
// Claves pequeñas y planas; nada de blob gigante. Fechas ISO, números a 2-4 decimales.
import type { KvStore } from "./store.js";
import { buildSeed, type Agent, type Department, type Channel } from "./seed.js";

export const FUND_BASE = 500;
const BASE_PRICES: Record<string, number> = {
  BTC: 67500, ETH: 3520, SOL: 172, XRP: 0.62, BNB: 595, DOGE: 0.16,
  ADA: 0.58, AVAX: 36.4, LINK: 18.2, NEAR: 7.8, TRX: 0.12, LTC: 84,
};

export interface FundMeta {
  tickN: number; opN: number; msgN: number; today: string;
  dayStartEquity: number; equity: number; peakEquity: number; dayPnl: number; drawdown: number;
  kill: boolean; suspended: string[]; targetAnnounced: boolean;
}

async function readJson<T>(kv: KvStore, key: string, fallback: T): Promise<T> {
  try {
    const raw = await kv.get(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}
const writeJson = (kv: KvStore, key: string, v: unknown) => kv.set(key, JSON.stringify(v));

async function readHash<T>(kv: KvStore, key: string): Promise<Record<string, T>> {
  const raw = await kv.hgetall(key);
  const o: Record<string, T> = {};
  for (const [k, v] of Object.entries(raw)) {
    try { o[k] = JSON.parse(v) as T; } catch { /* skip corrupto */ }
  }
  return o;
}

async function pushTrim(kv: KvStore, key: string, item: unknown, cap: number): Promise<void> {
  await kv.rpush(key, JSON.stringify(item));
  const n = await kv.llen(key);
  if (n > cap) await kv.ltrim(key, n - cap, -1);
}

async function readList<T>(kv: KvStore, key: string, limit = 100): Promise<T[]> {
  const raw = await kv.lrange(key, -limit, -1);
  const out: T[] = [];
  for (const s of raw) {
    try { out.push(JSON.parse(s) as T); } catch { /* skip */ }
  }
  return out;
}

export async function ensureSeed(kv: KvStore, nowIso: string): Promise<boolean> {
  if (await kv.get("fund:meta")) return false;
  const { departments, agents, channels } = buildSeed();
  const today = nowIso.slice(0, 10);
  const meta: FundMeta = {
    tickN: 0, opN: 1, msgN: 5, today,
    dayStartEquity: FUND_BASE, equity: FUND_BASE, peakEquity: FUND_BASE, dayPnl: 0, drawdown: 0,
    kill: false, suspended: [], targetAnnounced: false,
  };
  await writeJson(kv, "fund:meta", meta);
  await writeJson(kv, "fund:market", {
    prices: { ...BASE_PRICES }, lastTick: { prices: { ...BASE_PRICES }, funding: 0.01, fear_greed: 50, risk_mode: "RISK-ON", ts: nowIso },
  });
  for (const a of agents) await kv.hset("fund:agents", a.id, JSON.stringify(a));
  await writeJson(kv, "fund:committee", { active: false, topic: "", started_at: null, ticks: 0, backup: {}, log: [] });
  const seedMsgs = [
    { id: "m-1", channel_id: "c-general", from_agent_id: agents[14].id, text: "Sin posición en SOL. Esperando que Setup_9373 dé señal.", kind: "idea", created_at: nowIso },
    { id: "m-2", channel_id: "c-general", from_agent_id: agents[15].id, text: "Café y vuelvo a la pantalla.", kind: "social", created_at: nowIso },
  ];
  for (const m of seedMsgs) await kv.rpush("fund:msgs", JSON.stringify(m));
  await writeJson(kv, "fund:depts", departments);
  await writeJson(kv, "fund:channels", channels);
  return true;
}

export const repo = {
  meta: (kv: KvStore) => readJson<FundMeta>(kv, "fund:meta", null as unknown as FundMeta),
  saveMeta: (kv: KvStore, m: FundMeta) => writeJson(kv, "fund:meta", m),
  market: (kv: KvStore) => readJson<any>(kv, "fund:market", null),
  saveMarket: (kv: KvStore, m: any) => writeJson(kv, "fund:market", m),
  agents: (kv: KvStore) => readHash<Agent>(kv, "fund:agents"),
  saveAgent: (kv: KvStore, a: Agent) => kv.hset("fund:agents", a.id, JSON.stringify(a)),
  departments: (kv: KvStore) => readJson<Department[]>(kv, "fund:depts", []),
  channels: (kv: KvStore) => readJson<Channel[]>(kv, "fund:channels", []),
  committee: (kv: KvStore) => readJson<any>(kv, "fund:committee", { active: false }),
  saveCommittee: (kv: KvStore, c: any) => writeJson(kv, "fund:committee", c),
  day: (kv: KvStore, date: string) => readHash<any>(kv, `fund:day:${date}`),
  saveDay: (kv: KvStore, date: string, field: string, v: any) => kv.hset(`fund:day:${date}`, field, JSON.stringify(v)),
  openOps: (kv: KvStore) => readHash<any>(kv, "fund:ops:open"),
  saveOpenOp: (kv: KvStore, o: any) => kv.hset("fund:ops:open", o.id, JSON.stringify(o)),
  delOpenOp: (kv: KvStore, id: string) => kv.hdel("fund:ops:open", id),
  closedOps: (kv: KvStore, n = 100) => readList<any>(kv, "fund:ops:closed", n),
  pushClosed: (kv: KvStore, o: any) => pushTrim(kv, "fund:ops:closed", o, 250),
  blockedOps: (kv: KvStore, n = 100) => readList<any>(kv, "fund:ops:blocked", n),
  pushBlocked: (kv: KvStore, o: any) => pushTrim(kv, "fund:ops:blocked", o, 80),
  messages: (kv: KvStore, channel: string, n = 50) => readList<any>(kv, "fund:msgs", 500).then(all => all.filter((m: any) => m.channel_id === channel).slice(-n)),
  pushMsg: (kv: KvStore, m: any) => pushTrim(kv, "fund:msgs", m, 500),
  meetings: (kv: KvStore) => readList<any>(kv, "fund:meetings", 20),
  pushMeeting: (kv: KvStore, m: any) => pushTrim(kv, "fund:meetings", m, 20),
  memory: (kv: KvStore, q: string, n = 30) => readList<any>(kv, "fund:memory", 200).then(all => {
    const list = q ? all.filter((e: any) => `${e.text} ${e.pair} ${e.author} ${e.kind}`.toLowerCase().includes(q.toLowerCase())) : all;
    return list.slice(-n).reverse();
  }),
  pushMemory: (kv: KvStore, e: any) => pushTrim(kv, "fund:memory", e, 200),
  xp: (kv: KvStore) => readHash<any>(kv, "fund:xp"),
  awardXp: async (kv: KvStore, agentId: string, subject: string, amount: number) => {
    const all = await readHash<any>(kv, "fund:xp");
    const cur = all[agentId] || {};
    cur[subject] = (cur[subject] || 0) + amount;
    await kv.hset("fund:xp", agentId, JSON.stringify(cur));
    return cur;
  },
  learnings: (kv: KvStore, n = 50) => readList<any>(kv, "fund:learnings", n),
  pushLearning: (kv: KvStore, l: any) => pushTrim(kv, "fund:learnings", l, 300),
  strategies: (kv: KvStore) => readHash<any>(kv, "fund:strategies"),
  saveStrategy: (kv: KvStore, s: any) => kv.hset("fund:strategies", s.id, JSON.stringify(s)),
  snapshots: (kv: KvStore, n = 100) => readList<any>(kv, "fund:snapshots", n),
  pushSnapshot: (kv: KvStore, s: any) => pushTrim(kv, "fund:snapshots", s, 500),
  audit: (kv: KvStore, n = 50) => readList<any>(kv, "fund:audit", n),
  pushAudit: (kv: KvStore, e: any) => pushTrim(kv, "fund:audit", e, 100),
  targetDays: (kv: KvStore) => readHash<any>(kv, "fund:target_days"),
  saveTargetDay: (kv: KvStore, day: string, v: any) => kv.hset("fund:target_days", day, JSON.stringify(v)),
  bufs: (kv: KvStore) => readJson<any>(kv, "fund:bufs", {}),
  saveBufs: (kv: KvStore, b: any) => writeJson(kv, "fund:bufs", b),
  venues: (kv: KvStore) => readJson<any>(kv, "fund:venues", {}),
  saveVenues: (kv: KvStore, v: any) => writeJson(kv, "fund:venues", v),
  eps: (kv: KvStore) => readJson<any>(kv, "fund:eps", {}),
  saveEps: (kv: KvStore, e: any) => writeJson(kv, "fund:eps", e),
};
