"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpstashKv = exports.MemoryKv = void 0;
exports.withLock = withLock;
exports.resolveKv = resolveKv;
class MemoryKv {
    kv = new Map();
    exp = new Map();
    hash = new Map();
    lists = new Map();
    async get(k) {
        const e = this.exp.get(k);
        if (e !== undefined && Date.now() > e) {
            this.kv.delete(k);
            this.exp.delete(k);
            return null;
        }
        return this.kv.has(k) ? this.kv.get(k) : null;
    }
    async set(k, v) { this.kv.set(k, v); this.exp.delete(k); }
    async setNx(k, v, ttlMs) {
        if ((await this.get(k)) !== null)
            return false;
        this.kv.set(k, v);
        this.exp.set(k, Date.now() + ttlMs);
        return true;
    }
    async del(k) { this.kv.delete(k); this.hash.delete(k); this.lists.delete(k); }
    async hgetall(k) { return Object.fromEntries(this.hash.get(k) ?? new Map()); }
    async hset(k, f, v) {
        if (!this.hash.has(k))
            this.hash.set(k, new Map());
        this.hash.get(k).set(f, v);
    }
    async hdel(k, f) { this.hash.get(k)?.delete(f); }
    norm(l, s, e) {
        const n = l.length;
        const a = s < 0 ? Math.max(0, n + s) : Math.min(s, n);
        const b = e < 0 ? n + e : Math.min(e, n - 1);
        return a > b ? [] : l.slice(a, b + 1);
    }
    async lrange(k, s, e) { return this.norm(this.lists.get(k) ?? [], s, e); }
    async rpush(k, ...vs) {
        if (!this.lists.has(k))
            this.lists.set(k, []);
        this.lists.get(k).push(...vs);
    }
    async ltrim(k, s, e) { this.lists.set(k, this.norm(this.lists.get(k) ?? [], s, e)); }
    async llen(k) { return (this.lists.get(k) ?? []).length; }
}
exports.MemoryKv = MemoryKv;
// Lock corto anti-doble-ejecució (cron solapado, doble clic).
// Devuelve { locked: true } si otro lo tiene; si no, ejecuta y libera.
async function withLock(kv, key, ttlMs, fn) {
    const token = `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
    if (!(await kv.setNx(key, token, ttlMs)))
        return { locked: true };
    try {
        return { locked: false, result: await fn() };
    }
    finally {
        try {
            const cur = await kv.get(key);
            if (cur === token)
                await kv.del(key);
        }
        catch { /* liberar es best-effort; el TTL cubre */ }
    }
}
// Resuelve endpoint REST + token desde KV_* o derivando de REDIS_URL.
function resolveKv(env) {
    if (env.KV_REST_API_URL && env.KV_REST_API_TOKEN) {
        return { url: env.KV_REST_API_URL.replace(/\/$/, ""), token: env.KV_REST_API_TOKEN };
    }
    const m = (env.REDIS_URL || "").match(/^rediss?:\/\/[^:]+:([^@]+)@([^:/]+)/);
    if (m)
        return { url: `https://${m[2]}`, token: m[1] };
    return null;
}
class UpstashKv {
    url;
    token;
    constructor(url, token) {
        this.url = url;
        this.token = token;
    }
    async cmd(...args) {
        const r = await fetch(this.url, {
            method: "POST",
            headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
            body: JSON.stringify(args),
        });
        if (!r.ok)
            throw new Error(`KV ${r.status}`);
        const j = await r.json();
        if (j.error)
            throw new Error(`KV: ${j.error}`);
        return j.result;
    }
    async get(k) { return (await this.cmd("GET", k)); }
    async set(k, v) { await this.cmd("SET", k, v); }
    async setNx(k, v, ttlMs) {
        return (await this.cmd("SET", k, v, "NX", "PX", Math.max(1, Math.round(ttlMs)))) === "OK";
    }
    async del(k) { await this.cmd("DEL", k); }
    async hgetall(k) {
        const arr = (await this.cmd("HGETALL", k));
        const o = {};
        if (arr)
            for (let i = 0; i < arr.length; i += 2)
                o[arr[i]] = arr[i + 1];
        return o;
    }
    async hset(k, f, v) { await this.cmd("HSET", k, f, v); }
    async hdel(k, f) { await this.cmd("HDEL", k, f); }
    async lrange(k, s, e) { return ((await this.cmd("LRANGE", k, s, e)) ?? []); }
    async rpush(k, ...vs) { if (vs.length)
        await this.cmd("RPUSH", k, ...vs); }
    async ltrim(k, s, e) { await this.cmd("LTRIM", k, s, e); }
    async llen(k) { return Number(await this.cmd("LLEN", k)); }
}
exports.UpstashKv = UpstashKv;
