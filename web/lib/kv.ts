// Acceso KV: Upstash REST en producción, memoria en local sin env.
// Soporta KV_REST_API_URL/TOKEN y deriva REST desde REDIS_URL.
import { MemoryKv, UpstashKv, resolveKv, type KvStore } from "../lib/store.js";

let mem: MemoryKv | null = null;

export function getKv(): KvStore {
  const found = resolveKv(process.env as Record<string, string>);
  if (found) return new UpstashKv(found.url, found.token);
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
