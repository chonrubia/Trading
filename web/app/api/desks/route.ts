import { getKv, json } from "../../../lib/kv.js";
import { repo, ensureSeed } from "../../../lib/state.js";

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const revalidate = 0;

// En modo real no hay mesas sintéticas: derivados, arbitraje y cobertura
// quedan desactivados. Solo se informa del funding real de Binance.
export async function GET() {
  const kv = getKv();
  await ensureSeed(kv, new Date().toISOString());
  const market = await repo.market(kv);
  return json({
    available: false,
    disabled: ["arbitraje", "derivados", "cobertura"],
    reason: "Spot 1x con datos reales: sin cortos, sin futuros, sin arbitraje sintético.",
    venues: [],
    funding: market?.lastTick?.funding ?? 0,
    arbOpen: [],
    derivadosOpen: 0,
    hedge: null,
    signal: "no disponible",
    pnl: { spot: null, arbitraje: null, derivados: null, cobertura: null },
  });
}
