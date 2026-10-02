import { getKv, json } from "../../../lib/kv.js";
import { repo, ensureSeed } from "../../../lib/state.js";

export async function GET(req: Request) {
  const kv = getKv();
  await ensureSeed(kv, new Date().toISOString());
  const { searchParams } = new URL(req.url);
  const dept = searchParams.get("dept"), q = searchParams.get("q"), limit = Number(searchParams.get("limit")) || 200;
  let list = Object.values(await repo.agents(kv));
  if (dept) list = list.filter((a: any) => a.department_id === dept);
  if (q) list = list.filter((a: any) => `${a.name} ${a.strategy} ${a.pair}`.toLowerCase().includes(q.toLowerCase()));
  return json(list.slice(0, limit));
}
