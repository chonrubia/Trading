import { getKv, json } from "../../../lib/kv.js";
import { repo, ensureSeed } from "../../../lib/state.js";

export async function GET(req: Request) {
  const kv = getKv();
  await ensureSeed(kv, new Date().toISOString());
  const { searchParams } = new URL(req.url);
  return json(await repo.audit(kv, Number(searchParams.get("limit")) || 50));
}
