import { getKv, json } from "../../../../../lib/kv.js";
import { repo, ensureSeed } from "../../../../../lib/state.js";

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const revalidate = 0;

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const kv = getKv();
  await ensureSeed(kv, new Date().toISOString());
  const [msgs, agentsMap] = await Promise.all([repo.messages(kv, params.id, 50), repo.agents(kv)]);
  const names: Record<string, string> = {};
  Object.values(agentsMap).forEach((a: any) => (names[a.id] = a.name));
  return json(msgs.map((m: any) => ({ ...m, from: names[m.from_agent_id] || "Tú" })));
}
