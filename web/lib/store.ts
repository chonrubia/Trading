// Repositorio de estado particionado (diseño council ADR).
// KvStore: interfaz mínima. MemoryKv: fake en memoria (tests).
// UpstashKv: Redis vía REST (serverless). Sin TTL: el trim lo hace el motor.
export interface KvStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  setNx(key: string, value: string, ttlMs: number): Promise<boolean>;
  del(key: string): Promise<void>;
  hgetall(key: string): Promise<Record<string, string>>;
  hset(key: string, field: string, value: string): Promise<void>;
  hdel(key: string, field: string): Promise<void>;
  lrange(key: string, start: number, stop: number): Promise<string[]>;
  rpush(key: string, ...values: string[]): Promise<void>;
  ltrim(key: string, start: number, stop: number): Promise<void>;
  llen(key: string): Promise<number>;
}

export class MemoryKv implements KvStore {
  private kv = new Map<string, string>();
  private exp = new Map<string, number>();
  private hash = new Map<string, Map<string, string>>();
  private lists = new Map<string, string[]>();
  async get(k: string) {
    const e = this.exp.get(k);
    if (e !== undefined && Date.now() > e) { this.kv.delete(k); this.exp.delete(k); return null; }
    return this.kv.has(k) ? this.kv.get(k)! : null;
  }
  async set(k: string, v: string) { this.kv.set(k, v); this.exp.delete(k); }
  async setNx(k: string, v: string, ttlMs: number) {
    if ((await this.get(k)) !== null) return false;
    this.kv.set(k, v);
    this.exp.set(k, Date.now() + ttlMs);
    return true;
  }
  async del(k: string) { this.kv.delete(k); this.hash.delete(k); this.lists.delete(k); }
  async hgetall(k: string) { return Object.fromEntries(this.hash.get(k) ?? new Map()); }
  async hset(k: string, f: string, v: string) {
    if (!this.hash.has(k)) this.hash.set(k, new Map());
    this.hash.get(k)!.set(f, v);
  }
  async hdel(k: string, f: string) { this.hash.get(k)?.delete(f); }
  private norm(l: string[], s: number, e: number) {
    const n = l.length;
    const a = s < 0 ? Math.max(0, n + s) : Math.min(s, n);
    const b = e < 0 ? n + e : Math.min(e, n - 1);
    return a > b ? [] : l.slice(a, b + 1);
  }
  async lrange(k: string, s: number, e: number) { return this.norm(this.lists.get(k) ?? [], s, e); }
  async rpush(k: string, ...vs: string[]) {
    if (!this.lists.has(k)) this.lists.set(k, []);
    this.lists.get(k)!.push(...vs);
  }
  async ltrim(k: string, s: number, e: number) { this.lists.set(k, this.norm(this.lists.get(k) ?? [], s, e)); }
  async llen(k: string) { return (this.lists.get(k) ?? []).length; }
}

export interface KvEnv {
  KV_REST_API_URL?: string;
  KV_REST_API_TOKEN?: string;
  REDIS_URL?: string;
}

// Lock corto anti-doble-ejecució (cron solapado, doble clic).
// Devuelve { locked: true } si otro lo tiene; si no, ejecuta y libera.
export async function withLock<T>(kv: KvStore, key: string, ttlMs: number, fn: () => Promise<T>): Promise<{ locked: boolean; result?: T }> {
  const token = `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  if (!(await kv.setNx(key, token, ttlMs))) return { locked: true };
  try {
    return { locked: false, result: await fn() };
  } finally {
    try {
      const cur = await kv.get(key);
      if (cur === token) await kv.del(key);
    } catch { /* liberar es best-effort; el TTL cubre */ }
  }
}

// Resuelve endpoint REST + token solo desde KV_* (Upstash REST real).
// NOTA: derivar REST desde REDIS_URL está prohibido: el host REDIS
// (db.redis.io) no sirve REST y provocaba ConnectTimeout en /api/tick.
export function resolveKv(env: KvEnv): { url: string; token: string } | null {
  if (env.KV_REST_API_URL && env.KV_REST_API_TOKEN) {
    return { url: env.KV_REST_API_URL.replace(/\/$/, ""), token: env.KV_REST_API_TOKEN };
  }
  return null;
}

// Resuelve conexión RESP real (Vercel Redis) desde REDIS_URL.
export function resolveRedis(env: KvEnv): string | null {
  return env.REDIS_URL || null;
}

export class UpstashKv implements KvStore {
  constructor(private url: string, private token: string) {}
  private async cmd(...args: Array<string | number>): Promise<any> {
    const r = await fetch(this.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    if (!r.ok) throw new Error(`KV ${r.status}`);
    const j = await r.json();
    if (j.error) throw new Error(`KV: ${j.error}`);
    return j.result;
  }
  async get(k: string) { return (await this.cmd("GET", k)) as string | null; }
  async set(k: string, v: string) { await this.cmd("SET", k, v); }
  async setNx(k: string, v: string, ttlMs: number) {
    return ((await this.cmd("SET", k, v, "NX", "PX", Math.max(1, Math.round(ttlMs)))) as string | null) === "OK";
  }
  async del(k: string) { await this.cmd("DEL", k); }
  async hgetall(k: string) {
    const arr = (await this.cmd("HGETALL", k)) as Array<string | null> | null;
    const o: Record<string, string> = {};
    if (arr) for (let i = 0; i < arr.length; i += 2) o[arr[i] as string] = arr[i + 1] as string;
    return o;
  }
  async hset(k: string, f: string, v: string) { await this.cmd("HSET", k, f, v); }
  async hdel(k: string, f: string) { await this.cmd("HDEL", k, f); }
  async lrange(k: string, s: number, e: number) { return ((await this.cmd("LRANGE", k, s, e)) ?? []) as string[]; }
  async rpush(k: string, ...vs: string[]) { if (vs.length) await this.cmd("RPUSH", k, ...vs); }
  async ltrim(k: string, s: number, e: number) { await this.cmd("LTRIM", k, s, e); }
  async llen(k: string) { return Number(await this.cmd("LLEN", k)); }
}

// Cliente RESP real para Vercel Redis (REDIS_URL rediss://...).
// Reutiliza una conexión por instancia serverless.
export class RedisKv implements KvStore {
  private client: any = null;
  private connecting: Promise<any> | null = null;
  constructor(private url: string) {}
  private async conn() {
    if (this.client?.isOpen) return this.client;
    if (!this.connecting) {
      const { createClient } = await import("redis");
      const c = createClient({ url: this.url });
      this.connecting = c.connect().then(() => (this.client = c));
    }
    await this.connecting;
    return this.client;
  }
  async get(k: string) {
    const v = await (await this.conn()).get(k);
    return v == null ? null : String(v);
  }
  async set(k: string, v: string) { await (await this.conn()).set(k, v); }
  async setNx(k: string, v: string, ttlMs: number) {
    const r = await (await this.conn()).set(k, v, { NX: true, PX: Math.max(1, Math.round(ttlMs)) });
    return r === "OK";
  }
  async del(k: string) { await (await this.conn()).del(k); }
  async hgetall(k: string) { return ((await (await this.conn()).hGetAll(k)) ?? {}) as Record<string, string>; }
  async hset(k: string, f: string, v: string) { await (await this.conn()).hSet(k, f, v); }
  async hdel(k: string, f: string) { await (await this.conn()).hDel(k, f); }
  async lrange(k: string, s: number, e: number) { return (await (await this.conn()).lRange(k, s, e)) as string[]; }
  async rpush(k: string, ...vs: string[]) { if (vs.length) await (await this.conn()).rPush(k, vs); }
  async ltrim(k: string, s: number, e: number) { await (await this.conn()).lTrim(k, s, e); }
  async llen(k: string) { return Number(await (await this.conn()).lLen(k)); }
}
