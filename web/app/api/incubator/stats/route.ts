import { getKv, json } from "../../../../lib/kv.js";
import { repo, ensureSeed } from "../../../../lib/state.js";

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const revalidate = 0;

export async function GET() {
  const kv = getKv();
  await ensureSeed(kv, new Date().toISOString());
  const all = Object.values(await repo.strategies(kv)) as any[];
  const c: Record<string, number> = {};
  all.forEach(s => (c[s.status] = (c[s.status] || 0) + 1));
  return json({ ...c, total: all.length, activas: c.activa || 0, incubacion: c.incubacion || 0, lista: c.lista || 0 });
}
