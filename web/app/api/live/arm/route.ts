import { getKv, json, body } from "../../../../lib/kv.js";
import { ensureSeed, repo } from "../../../../lib/state.js";
import { liveReadiness } from "../../../../lib/validation.js";

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const revalidate = 0;

/**
 * Armado manual del modo live. Requiere:
 *  - LIVE_TRADING_ENABLED=true
 *  - CRON_SECRET en Authorization
 *  - claves Binance de solo trading
 *  - validación forward completa (28 días, OOS, DD, latido)
 *  - confirmación literal "ARM LIVE"
 * La ventana dura 15 minutos; después hay que volver a armar.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET || "";
  if (!secret) return json({ error: "falta CRON_SECRET" }, 503);
  if ((req.headers.get("authorization") || "") !== `Bearer ${secret}`) return json({ error: "unauthorized" }, 401);
  if (process.env.LIVE_TRADING_ENABLED !== "true") return json({ error: "LIVE_TRADING_ENABLED no está activo" }, 403);
  if (!process.env.BINANCE_API_KEY || !process.env.BINANCE_API_SECRET) return json({ error: "faltan BINANCE_API_KEY / BINANCE_API_SECRET" }, 400);
  const { confirm } = await body<{ confirm?: string }>(req);
  if (confirm !== "ARM LIVE") return json({ error: 'confirmación requerida: {"confirm":"ARM LIVE"}' }, 400);

  const kv = getKv();
  await ensureSeed(kv, new Date().toISOString());
  const readiness = await liveReadiness(kv);
  if (!readiness.ready_for_live) return json({ error: "validación forward incompleta", failed: readiness.failed, criteria: readiness.criteria }, 409);

  const now = Date.now();
  const arm = {
    armed: true,
    armed_at: new Date(now).toISOString(),
    expires_at: new Date(now + 15 * 60_000).toISOString(),
    by: "human",
    criteria: readiness.criteria,
  };
  await repo.saveLiveArm(kv, arm);
  await repo.pushAudit(kv, { ts: arm.armed_at, ev: "live.arm", expires_at: arm.expires_at });
  return json({ ...arm, limits: { max_positions: 3, max_order_eur: 10, max_day_loss: 15, max_drawdown: 30 } });
}
