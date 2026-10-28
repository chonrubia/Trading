// Riesgos. Port exacto de backend/src/risk.js (F0 lo congela).
// Sin singletons: kill/suspendidos viajan en ctx (KV en serverless).
export const FUND_LIMITS = {
  max_day_loss: null as number | null,
  max_drawdown: null as number | null,
  max_exposure_gross: 150,
  max_leverage: 5,
  max_pair_concentration: 30,
};

// Límites duros del modo real (spot 1x, sin cortos ni apalancamiento).
export const SPOT_LIMITS = {
  market: "spot" as const,
  shorting: false,
  max_leverage: 1,
  max_positions: 3,
  max_order_eur: 10,
  min_order_eur: 5,
  max_day_loss: 15,
  max_drawdown: 30,
  max_exposure_pct: 60,
};

export interface OpenOp { status: string; pair?: string; size: number; entry: number }
export interface RiskCtx {
  equity: number;
  killSwitch: boolean;
  suspended: string[];
  openOps: OpenOp[];
}
export interface AgentLike { id: string; name: string; leverage: number; pnl: number }
export interface Proposal { pair: string; entry: number; size: number; leverage: number; side?: string }

export function fundExposure(openOps: OpenOp[], equity: number): number {
  if (!equity) return 0;
  const notional = openOps.filter(o => o.status === "abierta").reduce((s, o) => s + Math.abs(o.size * o.entry), 0);
  return Math.round((notional / equity) * 10000) / 100;
}

export function checkOperation(agent: AgentLike, prop: Proposal, ctx: RiskCtx): { approved: boolean; blocked: boolean; reason: string; size: number; leverage: number } {
  const open = ctx.openOps.filter(o => o.status === "abierta");
  const notional = Math.abs(prop.size * prop.entry);
  const exposure = fundExposure(open, ctx.equity);
  const pairExp = ctx.equity ? Math.round((open.filter(o => o.pair === prop.pair).reduce((s, o) => s + Math.abs(o.size * o.entry), 0) / ctx.equity) * 10000) / 100 : 0;
  const deny = (reason: string) => ({ approved: false, blocked: true, reason, size: prop.size, leverage: prop.leverage });
  if (ctx.killSwitch) return deny("kill switch activo");
  if (ctx.suspended.includes(agent.id)) return deny("agente suspendido");
  if (!ctx.equity) return deny("patrimonio no disponible");
  if (prop.leverage < 1 || prop.leverage > FUND_LIMITS.max_leverage) return deny(`apalancamiento ${prop.leverage}x fuera de límite`);
  if (notional < 1) return deny("nocional mínimo 1€");
  if (exposure + (notional / ctx.equity) * 100 > FUND_LIMITS.max_exposure_gross) return deny(`exposición ${exposure}% supera ${FUND_LIMITS.max_exposure_gross}%`);
  if (pairExp + (notional / ctx.equity) * 100 > FUND_LIMITS.max_pair_concentration) return deny(`concentración en ${prop.pair} supera ${FUND_LIMITS.max_pair_concentration}%`);
  if (agent.pnl < -Math.max(10, ctx.equity * 0.1)) return deny("agente en pérdida máxima");
  return { approved: true, blocked: false, reason: "aprobada", size: prop.size, leverage: prop.leverage };
}

export interface SpotOrderRequest {
  pair: string;
  side: "LONG";
  notional: number;
  price: number;
  openCount: number;
  cash: number;
  dayPnl: number;
  exposurePct: number;
  drawdown: number;
  suspended?: boolean;
  killSwitch?: boolean;
  dayHalt?: boolean;
}

/** Puerta única del modo real: spot, LONG, 1x, 3 posiciones y 10 €/orden. */
export function checkSpotOperation(req: SpotOrderRequest): { approved: boolean; reason: string } {
  if (req.killSwitch) return { approved: false, reason: "kill switch activo" };
  if (req.dayHalt) return { approved: false, reason: `pérdida diaria alcanzada (${SQ(req.dayPnl)}€ ≤ -${SPOT_LIMITS.max_day_loss}€)` };
  if (req.suspended) return { approved: false, reason: "agente suspendido" };
  if (req.side !== "LONG") return { approved: false, reason: "solo LONG en spot (sin cortos)" };
  if (req.openCount >= SPOT_LIMITS.max_positions) return { approved: false, reason: `máximo ${SPOT_LIMITS.max_positions} posiciones` };
  if (req.notional < SPOT_LIMITS.min_order_eur) return { approved: false, reason: `orden mínima ${SPOT_LIMITS.min_order_eur}€ (Binance min notional)` };
  if (req.notional > SPOT_LIMITS.max_order_eur) return { approved: false, reason: `orden máxima ${SPOT_LIMITS.max_order_eur}€` };
  if (req.notional > req.cash) return { approved: false, reason: "cash insuficiente" };
  if (req.dayPnl <= -SPOT_LIMITS.max_day_loss) return { approved: false, reason: `pérdida diaria ${SQ(req.dayPnl)}€` };
  if (req.drawdown >= SPOT_LIMITS.max_drawdown) return { approved: false, reason: `drawdown ${SQ(req.drawdown)}% ≥ ${SPOT_LIMITS.max_drawdown}%` };
  const equity = req.exposurePct < 100 ? req.cash / (1 - req.exposurePct / 100) : req.cash;
  if (req.exposurePct + (req.notional / Math.max(1, equity)) * 100 > SPOT_LIMITS.max_exposure_pct) {
    return { approved: false, reason: `exposición supera ${SPOT_LIMITS.max_exposure_pct}%` };
  }
  return { approved: true, reason: "aprobada" };
}

const SQ = (n: number) => Math.round(n * 100) / 100;
