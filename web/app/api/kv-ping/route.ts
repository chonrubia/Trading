import { getKv, json } from "../../../lib/kv.js";
import { resolveKv } from "../../../lib/store.js";

// Diagnóstico: ¿contra qué KV hablamos? NO expone secretos.
export async function GET() {
  const found = resolveKv(process.env as Record<string, string>);
  const kv = getKv();
  const key = `diag:${Date.now()}`;
  try {
    await kv.set(key, "1");
    const back = await kv.get(key);
    await kv.del(key);
    return json({ backend: found ? "upstash" : "memory", readback: back === "1" ? "ok" : "FAIL", ts: new Date().toISOString() });
  } catch (e: any) {
    return json({ backend: found ? "upstash" : "memory", readback: "FAIL", error: String(e?.message || e).slice(0, 120) }, 500);
  }
}
