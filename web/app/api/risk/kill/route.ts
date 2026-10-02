import { getKv, json, body } from "../../../../lib/kv.js";
import { repo, ensureSeed } from "../../../../lib/state.js";

export async function POST(req: Request) {
  const kv = getKv();
  await ensureSeed(kv, new Date().toISOString());
  const { active } = await body<{ active: boolean }>(req);
  const meta = await repo.meta(kv);
  meta.kill = !!active;
  await repo.saveMeta(kv, meta);
  const msg = { id: `m-kill-${Date.now()}`, channel_id: "c-general", from_agent_id: "a-002", text: active ? "Riesgos: KILL-SWITCH activado por humano. Trading detenido." : "Riesgos: kill-switch liberado. Reanudo paper.", kind: "alerta", created_at: new Date().toISOString() };
  await repo.pushMsg(kv, msg);
  await repo.pushAudit(kv, { ts: new Date().toISOString(), ev: "risk.kill", active: !!active });
  return json({ kill: meta.kill });
}
