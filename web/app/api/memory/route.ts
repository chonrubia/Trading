import { getKv, json, body } from "../../../lib/kv.js";
import { repo, ensureSeed } from "../../../lib/state.js";

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const revalidate = 0;

export async function GET(req: Request) {
  const kv = getKv();
  await ensureSeed(kv, new Date().toISOString());
  const { searchParams } = new URL(req.url);
  return json(await repo.memory(kv, searchParams.get("q") || "", Number(searchParams.get("limit")) || 30));
}

export async function POST(req: Request) {
  const { author = "Tú (humano)", dept = "direccion", pair = "BTC", text, kind = "nota" } = await body<any>(req);
  const kv = getKv();
  await ensureSeed(kv, new Date().toISOString());
  if (!text) return json({ error: "text requerido" }, 400);
  const e = { id: `mem-${Date.now()}`, ts: new Date().toISOString(), author, dept, pair, text, kind };
  await repo.pushMemory(kv, e);
  await repo.pushAudit(kv, { ts: new Date().toISOString(), ev: "memory.add", id: e.id });
  return json(e);
}
