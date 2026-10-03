// Acceso KV: Upstash REST si hay KV_*; si no, Redis RESP real (REDIS_URL);
// memoria en local sin env o en fase de build.
import { MemoryKv, UpstashKv, RedisKv, resolveKv, resolveRedis, type KvStore } from "../lib/store.js";

let mem: MemoryKv | null = null;
let redis: RedisKv | null = null;

export function getKv(): KvStore {
  // En fase de build no hay red ni KV: memoria efímera para que el
  // prerender no tumbe `next build` (las rutas son force-dynamic en runtime).
  if (process.env.NEXT_PHASE === "phase-production-build") {
    if (!mem) mem = new MemoryKv();
    return mem;
  }
  const found = resolveKv(process.env as Record<string, string>);
  if (found) return new UpstashKv(found.url, found.token);
  const redisUrl = resolveRedis(process.env as Record<string, string>);
  if (redisUrl) {
    if (!redis) redis = new RedisKv(redisUrl);
    return redis;
  }
  // Sin KV en producción: fallar explícito (jamás estado fragmentado silencioso).
  if (process.env.VERCEL) throw new Error("KV no configurado: conecta un store en Storage");
  if (!mem) mem = new MemoryKv();
  return mem;
}

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

export async function body<T>(req: Request): Promise<T> {
  try { return (await req.json()) as T; } catch { return {} as T; }
}
