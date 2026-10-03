import { getKv, json, body } from "../../../../lib/kv.js";
import { withLock } from "../../../../lib/store.js";
import { repo, ensureSeed } from "../../../../lib/state.js";

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const revalidate = 0;

export async function POST(req: Request) {
  const kv = getKv();
  await ensureSeed(kv, new Date().toISOString());
  const { topic } = await body<{ topic?: string }>(req);
  const res = await withLock(kv, "lock:committee", 5000, async () => {
    const committee = await repo.committee(kv);
    if (committee?.active) return { active: true };
    const agentsMap = await repo.agents(kv);
    const first = Object.values(agentsMap)[0] as any;
    const next = {
      active: true, ticks: 0, log: [],
      topic: topic || "Reunión de comité: revisión de riesgos y ranking",
      started_at: new Date().toISOString(),
      backup: {},
    };
    await repo.saveCommittee(kv, next);
    const msg = { id: `m-c-${Date.now()}`, channel_id: "c-general", from_agent_id: first.id, text: `Comité convocado: ${next.topic}. Toda la oficina a la sala.`, kind: "alerta", created_at: new Date().toISOString() };
    await repo.pushMsg(kv, msg);
    await repo.pushAudit(kv, { ts: new Date().toISOString(), ev: "committee.start", topic: next.topic });
    return { active: true, topic: next.topic };
  });
  if (res.locked) return json({ error: "comité en curso, reintenta" }, 429);
  return json(res.result);
}
