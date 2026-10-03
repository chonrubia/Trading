import { getKv, json } from "../../../../../lib/kv.js";
import { repo, ensureSeed } from "../../../../../lib/state.js";

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const revalidate = 0;

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const kv = getKv();
  await ensureSeed(kv, new Date().toISOString());
  const all = await repo.learnings(kv, 300);
  return json(all.filter((l: any) => l.agent_id === params.id).slice(0, 20));
}
