"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.repo = exports.FUND_BASE = void 0;
exports.ensureSeed = ensureSeed;
const seed_js_1 = require("./seed.js");
exports.FUND_BASE = 500;
const BASE_PRICES = {
    BTC: 67500, ETH: 3520, SOL: 172, XRP: 0.62, BNB: 595, DOGE: 0.16,
    ADA: 0.58, AVAX: 36.4, LINK: 18.2, NEAR: 7.8, TRX: 0.12, LTC: 84,
};
async function readJson(kv, key, fallback) {
    try {
        const raw = await kv.get(key);
        return raw ? JSON.parse(raw) : fallback;
    }
    catch {
        return fallback;
    }
}
const writeJson = (kv, key, v) => kv.set(key, JSON.stringify(v));
async function readHash(kv, key) {
    const raw = await kv.hgetall(key);
    const o = {};
    for (const [k, v] of Object.entries(raw)) {
        try {
            o[k] = JSON.parse(v);
        }
        catch { /* skip corrupto */ }
    }
    return o;
}
async function pushTrim(kv, key, item, cap) {
    await kv.rpush(key, JSON.stringify(item));
    const n = await kv.llen(key);
    if (n > cap)
        await kv.ltrim(key, n - cap, -1);
}
async function readList(kv, key, limit = 100) {
    const raw = await kv.lrange(key, -limit, -1);
    const out = [];
    for (const s of raw) {
        try {
            out.push(JSON.parse(s));
        }
        catch { /* skip */ }
    }
    return out;
}
async function ensureSeed(kv, nowIso) {
    if (await kv.get("fund:meta"))
        return false;
    const { departments, agents, channels } = (0, seed_js_1.buildSeed)();
    const today = nowIso.slice(0, 10);
    const meta = {
        tickN: 0, opN: 1, msgN: 5, today,
        dayStartEquity: exports.FUND_BASE, equity: exports.FUND_BASE, peakEquity: exports.FUND_BASE, dayPnl: 0, drawdown: 0,
        kill: false, suspended: [], targetAnnounced: false,
    };
    await writeJson(kv, "fund:meta", meta);
    await writeJson(kv, "fund:market", {
        prices: { ...BASE_PRICES }, lastTick: { prices: { ...BASE_PRICES }, funding: 0.01, fear_greed: 50, risk_mode: "RISK-ON", ts: nowIso },
    });
    for (const a of agents)
        await kv.hset("fund:agents", a.id, JSON.stringify(a));
    await writeJson(kv, "fund:committee", { active: false, topic: "", started_at: null, ticks: 0, backup: {}, log: [] });
    const seedMsgs = [
        { id: "m-1", channel_id: "c-general", from_agent_id: agents[14].id, text: "Sin posición en SOL. Esperando que Setup_9373 dé señal.", kind: "idea", created_at: nowIso },
        { id: "m-2", channel_id: "c-general", from_agent_id: agents[15].id, text: "Café y vuelvo a la pantalla.", kind: "social", created_at: nowIso },
    ];
    for (const m of seedMsgs)
        await kv.rpush("fund:msgs", JSON.stringify(m));
    await writeJson(kv, "fund:depts", departments);
    await writeJson(kv, "fund:channels", channels);
    return true;
}
exports.repo = {
    meta: (kv) => readJson(kv, "fund:meta", null),
    saveMeta: (kv, m) => writeJson(kv, "fund:meta", m),
    market: (kv) => readJson(kv, "fund:market", null),
    saveMarket: (kv, m) => writeJson(kv, "fund:market", m),
    agents: (kv) => readHash(kv, "fund:agents"),
    saveAgent: (kv, a) => kv.hset("fund:agents", a.id, JSON.stringify(a)),
    departments: (kv) => readJson(kv, "fund:depts", []),
    channels: (kv) => readJson(kv, "fund:channels", []),
    committee: (kv) => readJson(kv, "fund:committee", { active: false }),
    saveCommittee: (kv, c) => writeJson(kv, "fund:committee", c),
    day: (kv, date) => readHash(kv, `fund:day:${date}`),
    saveDay: (kv, date, field, v) => kv.hset(`fund:day:${date}`, field, JSON.stringify(v)),
    openOps: (kv) => readHash(kv, "fund:ops:open"),
    saveOpenOp: (kv, o) => kv.hset("fund:ops:open", o.id, JSON.stringify(o)),
    delOpenOp: (kv, id) => kv.hdel("fund:ops:open", id),
    closedOps: (kv, n = 100) => readList(kv, "fund:ops:closed", n),
    pushClosed: (kv, o) => pushTrim(kv, "fund:ops:closed", o, 250),
    blockedOps: (kv, n = 100) => readList(kv, "fund:ops:blocked", n),
    pushBlocked: (kv, o) => pushTrim(kv, "fund:ops:blocked", o, 80),
    messages: (kv, channel, n = 50) => readList(kv, "fund:msgs", 500).then(all => all.filter((m) => m.channel_id === channel).slice(-n)),
    pushMsg: (kv, m) => pushTrim(kv, "fund:msgs", m, 500),
    meetings: (kv) => readList(kv, "fund:meetings", 20),
    pushMeeting: (kv, m) => pushTrim(kv, "fund:meetings", m, 20),
    memory: (kv, q, n = 30) => readList(kv, "fund:memory", 200).then(all => {
        const list = q ? all.filter((e) => `${e.text} ${e.pair} ${e.author} ${e.kind}`.toLowerCase().includes(q.toLowerCase())) : all;
        return list.slice(-n).reverse();
    }),
    pushMemory: (kv, e) => pushTrim(kv, "fund:memory", e, 200),
    xp: (kv) => readHash(kv, "fund:xp"),
    awardXp: async (kv, agentId, subject, amount) => {
        const all = await readHash(kv, "fund:xp");
        const cur = all[agentId] || {};
        cur[subject] = (cur[subject] || 0) + amount;
        await kv.hset("fund:xp", agentId, JSON.stringify(cur));
        return cur;
    },
    learnings: (kv, n = 50) => readList(kv, "fund:learnings", n),
    pushLearning: (kv, l) => pushTrim(kv, "fund:learnings", l, 300),
    strategies: (kv) => readHash(kv, "fund:strategies"),
    saveStrategy: (kv, s) => kv.hset("fund:strategies", s.id, JSON.stringify(s)),
    snapshots: (kv, n = 100) => readList(kv, "fund:snapshots", n),
    pushSnapshot: (kv, s) => pushTrim(kv, "fund:snapshots", s, 500),
    audit: (kv, n = 50) => readList(kv, "fund:audit", n),
    pushAudit: (kv, e) => pushTrim(kv, "fund:audit", e, 100),
    targetDays: (kv) => readHash(kv, "fund:target_days"),
    saveTargetDay: (kv, day, v) => kv.hset("fund:target_days", day, JSON.stringify(v)),
    bufs: (kv) => readJson(kv, "fund:bufs", {}),
    saveBufs: (kv, b) => writeJson(kv, "fund:bufs", b),
    venues: (kv) => readJson(kv, "fund:venues", {}),
    saveVenues: (kv, v) => writeJson(kv, "fund:venues", v),
    eps: (kv) => readJson(kv, "fund:eps", {}),
    saveEps: (kv, e) => writeJson(kv, "fund:eps", e),
};
