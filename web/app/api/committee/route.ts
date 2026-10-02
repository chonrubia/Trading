import { getKv, json } from "../../../lib/kv.js";
import { repo, ensureSeed } from "../../../lib/state.js";

export async function GET() {
  const kv = getKv();
  await ensureSeed(kv, new Date().toISOString());
  const c = await repo.committee(kv);
  return json({ active: !!c?.active, topic: c?.topic || "", ticks: c?.ticks || 0 });
}
