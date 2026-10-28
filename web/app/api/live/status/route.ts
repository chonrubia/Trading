import { getKv, json } from "../../../../lib/kv.js";
import { ensureSeed, repo } from "../../../../lib/state.js";
import { SPOT_LIMITS } from "../../../../lib/risk.js";
import { liveReadiness } from "../../../../lib/validation.js";

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const revalidate = 0;

export async function GET() {
  const kv = getKv();
  await ensureSeed(kv, new Date().toISOString());
  const [arm, readiness] = await Promise.all([repo.liveArm(kv), liveReadiness(kv)]);
  const armed = !!arm?.armed && Date.parse(arm?.expires_at || "") > Date.now();
  return json({
    engine: "v2",
    market: "spot",
    enabled: process.env.LIVE_TRADING_ENABLED === "true",
    keys_configured: !!(process.env.BINANCE_API_KEY && process.env.BINANCE_API_SECRET),
    armed,
    armed_until: armed ? arm.expires_at : null,
    armed_at: armed ? arm.armed_at : null,
    ready_for_live: readiness.ready_for_live,
    failed: readiness.failed,
    limits: SPOT_LIMITS,
    region: process.env.VERCEL_REGION || null,
    base_url: "https://api.binance.com",
    execution_wired: false,
    note: "Adaptador implementado pero NO conectado al motor en esta versión: ninguna orden real puede salir todavía. El armado es una preflight que exige validación forward; el cableado de ejecución se activa solo tras 28 días de paper y revisión humana.",
  });
}
