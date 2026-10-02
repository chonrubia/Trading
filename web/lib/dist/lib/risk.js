"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FUND_LIMITS = void 0;
exports.fundExposure = fundExposure;
exports.checkOperation = checkOperation;
// Riesgos. Port exacto de backend/src/risk.js (F0 lo congela).
// Sin singletons: kill/suspendidos viajan en ctx (KV en serverless).
exports.FUND_LIMITS = {
    max_day_loss: null,
    max_drawdown: null,
    max_exposure_gross: 150,
    max_leverage: 5,
    max_pair_concentration: 30,
};
function fundExposure(openOps, equity) {
    if (!equity)
        return 0;
    const notional = openOps.filter(o => o.status === "abierta").reduce((s, o) => s + Math.abs(o.size * o.entry), 0);
    return Math.round((notional / equity) * 10000) / 100;
}
function checkOperation(agent, prop, ctx) {
    if (ctx.killSwitch)
        return { approved: false, blocked: true, leverage: prop.leverage, size: prop.size, reason: "KILL-SWITCH activo: trading detenido por humano" };
    if (ctx.suspended.includes(agent.id))
        return { approved: false, blocked: true, leverage: prop.leverage, size: prop.size, reason: `Trader ${agent.name} suspendido por Riesgos` };
    let leverage = prop.leverage || agent.leverage || 1;
    let size = prop.size || 0.01;
    const notes = [];
    if (leverage > exports.FUND_LIMITS.max_leverage) {
        notes.push(`Apalancamiento ${leverage}x recortado a ${exports.FUND_LIMITS.max_leverage}x`);
        leverage = exports.FUND_LIMITS.max_leverage;
    }
    const notional = size * prop.entry;
    const exposure = fundExposure(ctx.openOps, ctx.equity);
    const newExposure = exposure + (Math.abs(notional) / ctx.equity) * 100;
    if (newExposure > exports.FUND_LIMITS.max_exposure_gross) {
        return { approved: false, blocked: true, leverage, size, reason: `Exposición ${newExposure.toFixed(1)}% superaría ${exports.FUND_LIMITS.max_exposure_gross}%` };
    }
    const pairNotional = ctx.openOps.filter(o => o.status === "abierta" && o.pair === prop.pair)
        .reduce((s, o) => s + Math.abs(o.size * o.entry), 0);
    const pairPct = ((pairNotional + Math.abs(notional)) / ctx.equity) * 100;
    if (pairPct > exports.FUND_LIMITS.max_pair_concentration) {
        return { approved: false, blocked: true, leverage, size, reason: `Concentración en ${prop.pair} ${pairPct.toFixed(1)}% > ${exports.FUND_LIMITS.max_pair_concentration}%` };
    }
    if (agent.pnl < -7.5) {
        const cap = 10 / prop.entry;
        if (size > cap) {
            notes.push(`Trader en drawdown (${agent.pnl}€): size recortado a 10€ nocional`);
            size = Math.round(cap * 10000) / 10000;
        }
    }
    return { approved: true, blocked: false, leverage, size, reason: notes.join(" · ") || "Riesgos: OK" };
}
