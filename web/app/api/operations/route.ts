import { getKv, json } from "../../../lib/kv.js";
import { repo, ensureSeed } from "../../../lib/state.js";

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const revalidate = 0;

export async function GET(req: Request) {
  const kv = getKv();
  await ensureSeed(kv, new Date().toISOString());
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status"), desk = searchParams.get("desk");
  const limit = Number(searchParams.get("limit")) || 50;
  const [closed, blocked, openMap] = await Promise.all([repo.closedOps(kv, 300), repo.blockedOps(kv, 100), repo.openOps(kv)]);
  let l = [...closed, ...blocked, ...Object.values(openMap)].reverse() as any[];
  if (status) l = l.filter(o => o.status === status);
  if (desk) l = l.filter(o => (o.desk || "spot") === desk);
  return json(l.slice(0, limit));
}
