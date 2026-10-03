import { getKv, json } from "../../../lib/kv.js";
import { repo, ensureSeed } from "../../../lib/state.js";

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const revalidate = 0;

export async function GET() {
  const kv = getKv();
  await ensureSeed(kv, new Date().toISOString());
  return json(await repo.channels(kv));
}
