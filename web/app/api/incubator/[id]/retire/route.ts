import { getKv, json } from "../../../../../lib/kv.js";
import { repo, ensureSeed } from "../../../../../lib/state.js";

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const revalidate = 0;

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const kv = getKv();
  await ensureSeed(kv, new Date().toISOString());
  const all = await repo.strategies(kv);
  const s = all[params.id];
  if (!s) return json({ error: "not found" }, 404);
  s.status = "retirada";
  await repo.saveStrategy(kv, s);
  await repo.pushAudit(kv, { ts: new Date().toISOString(), ev: "incubator.retire", id: s.id });
  return json(s);
}
