// Motor de riesgos paper — Fase 2.
// Ninguna orden se ejecuta sin pasar por aquí. Modo paper por defecto + kill-switch.

const FUND_LIMITS = {
  max_day_loss: -15,      // -3% de 500€
  max_drawdown: 10,         // %
  max_exposure_gross: 150,  // %
  max_leverage: 5,
  max_pair_concentration: 30, // % exposición por pair
};

let killSwitch = false;
const suspended = new Set(); // agent_ids suspendidos por Riesgos

function fundExposure(openOps, equity) {
  if (!equity) return 0;
  const notional = openOps.filter(o => o.status === "abierta").reduce((s, o) => s + Math.abs(o.size * o.entry), 0);
  return Math.round((notional / equity) * 10000) / 100;
}

function checkOperation(agent, prop, ctx) {
  // ctx: { equity, dayPnl, drawdown, openOps, prices }
  if (killSwitch) return { approved: false, blocked: true, reason: "KILL-SWITCH activo: trading detenido por humano" };
  if (suspended.has(agent.id)) return { approved: false, blocked: true, reason: `Trader ${agent.name} suspendido por Riesgos` };
  if (ctx.dayPnl <= FUND_LIMITS.max_day_loss) return { approved: false, blocked: true, reason: `Pérdida diaria del fondo ${ctx.dayPnl}€ supera límite ${FUND_LIMITS.max_day_loss}€` };
  if (ctx.drawdown >= FUND_LIMITS.max_drawdown) return { approved: false, blocked: true, reason: `Drawdown ${ctx.drawdown}% >= máximo ${FUND_LIMITS.max_drawdown}%` };

  let leverage = prop.leverage || agent.leverage || 1;
  let size = prop.size || 0.01;
  const notes = [];

  if (leverage > FUND_LIMITS.max_leverage) {
    notes.push(`Apalancamiento ${leverage}x recortado a ${FUND_LIMITS.max_leverage}x`);
    leverage = FUND_LIMITS.max_leverage;
  }
  const notional = size * prop.entry;
  const exposure = fundExposure(ctx.openOps, ctx.equity);
  const newExposure = exposure + (Math.abs(notional) / ctx.equity) * 100;
  if (newExposure > FUND_LIMITS.max_exposure_gross) {
    return { approved: false, blocked: true, reason: `Exposición ${newExposure.toFixed(1)}% superaría ${FUND_LIMITS.max_exposure_gross}%` };
  }
  // concentración por pair
  const pairNotional = ctx.openOps.filter(o => o.status === "abierta" && o.pair === prop.pair)
    .reduce((s, o) => s + Math.abs(o.size * o.entry), 0);
  const pairPct = ((pairNotional + Math.abs(notional)) / ctx.equity) * 100;
  if (pairPct > FUND_LIMITS.max_pair_concentration) {
    return { approved: false, blocked: true, reason: `Concentración en ${prop.pair} ${pairPct.toFixed(1)}% > ${FUND_LIMITS.max_pair_concentration}%` };
  }
  // riesgo por agente: si va muy perdedor, tope de 10€ nocional por trade
  if (agent.pnl < -7.5) {
    const cap = 10 / prop.entry;
    if (size > cap) {
      notes.push(`Trader en drawdown (${agent.pnl}€): size recortado a 10€ nocional`);
      size = Math.round(cap * 10000) / 10000;
    }
  }
  return { approved: true, blocked: false, leverage, size, reason: notes.join(" · ") || "Riesgos: OK" };
}

module.exports = { FUND_LIMITS, fundExposure, checkOperation, isKilled: () => killSwitch, setKill: (v) => { killSwitch = !!v; }, suspended };
