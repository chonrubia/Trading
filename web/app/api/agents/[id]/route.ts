import { getKv, json } from "../../../../lib/kv.js";
import { repo, ensureSeed } from "../../../../lib/state.js";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const kv = getKv();
  await ensureSeed(kv, new Date().toISOString());
  const agents = await repo.agents(kv);
  const a = agents[params.id];
  if (!a) return json({ error: "not found" }, 404);
  const meta = await repo.meta(kv);
  const [msgs, closed, openMap, learnings] = await Promise.all([
    repo.messages(kv, "c-general", 500), repo.closedOps(kv, 300), repo.openOps(kv), repo.learnings(kv, 300),
  ]);
  const ops = [...closed.filter((o: any) => o.agent_id === a.id), ...Object.values(openMap).filter((o: any) => o.agent_id === a.id)].slice(-10);
  return json({
    ...a,
    suspended: meta.suspended.includes(a.id),
    history: msgs.filter((m: any) => m.from_agent_id === a.id).slice(-10),
    ops,
    school: learnings.filter((l: any) => l.agent_id === a.id).slice(0, 8),
  });
}
