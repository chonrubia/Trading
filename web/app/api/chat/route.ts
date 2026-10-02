import { getKv, json, body } from "../../../lib/kv.js";
import { repo, ensureSeed } from "../../../lib/state.js";

export async function POST(req: Request) {
  const kv = getKv();
  await ensureSeed(kv, new Date().toISOString());
  const { channel_id = "c-general", text, to_agent_id = null } = await body<any>(req);
  if (!text) return json({ error: "text requerido" }, 400);
  const meta = await repo.meta(kv);
  const msg = { id: `m-u-${Date.now()}`, channel_id, from_agent_id: null, to_agent_id, text, kind: "humano", created_at: new Date().toISOString() };
  await repo.pushMsg(kv, msg);
  const agentsMap = await repo.agents(kv);
  const list = Object.values(agentsMap) as any[];
  const target = list.find((a: any) => a.id === to_agent_id) || list[Math.floor(Math.random() * list.length)];
  const reply = { id: `m-${meta.msgN + 1}`, channel_id, from_agent_id: target.id, text: `Recibido. Lo reviso con ${target.strategy} en ${target.pair} (${target.timeframe}).`, kind: "respuesta", created_at: new Date().toISOString() };
  await repo.pushMsg(kv, reply);
  meta.msgN += 2;
  await repo.saveMeta(kv, meta);
  return json({ ...msg, reply });
}
