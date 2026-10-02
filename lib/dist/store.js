"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpstashKv = exports.MemoryKv = void 0;
exports.resolveKv = resolveKv;
class MemoryKv {
    kv = new Map();
    hash = new Map();
    lists = new Map();
    async get(k) { return this.kv.has(k) ? this.kv.get(k) : null; }
    async set(k, v) { this.kv.set(k, v); }
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
