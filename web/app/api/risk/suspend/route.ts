import { getKv, json, body } from "../../../../lib/kv.js";
import { repo, ensureSeed } from "../../../../lib/state.js";

export async function POST(req: Request) {
  const kv = getKv();
  await ensureSeed(kv, new Date().toISOString());
  const { agent_id, active } = await body<any>(req);
  const meta = await repo.meta(kv);
  const set = new Set(meta.suspended);
  if (active) set.add(agent_id);
  else set.delete(agent_id);
  meta.suspended = [...set];
  await repo.saveMeta(kv, meta);
  await repo.pushAudit(kv, { ts: new Date().toISOString(), ev: "risk.suspend", agent_id, active: !!active });
  return json({ suspended: meta.suspended });
}
