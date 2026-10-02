import { getKv, json } from "../../../../lib/kv.js";
import { repo, ensureSeed } from "../../../../lib/state.js";
import { leaderboard } from "../../../../lib/stats.js";

export async function GET() {
  const kv = getKv();
  await ensureSeed(kv, new Date().toISOString());
  const [agentsMap, xp] = await Promise.all([repo.agents(kv), repo.xp(kv)]);
  return json(leaderboard(Object.values(agentsMap), xp, 12));
}
