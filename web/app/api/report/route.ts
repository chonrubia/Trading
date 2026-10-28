import { getKv, json } from "../../../lib/kv.js";
import { repo, ensureSeed } from "../../../lib/state.js";
import { summarize } from "../../../lib/accounting.js";
import { SPOT_TAKER, SLIP, HALF_SPREAD } from "../../../lib/costs.js";

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const revalidate = 0;

function stat(list: any[]) {
  const wins = list.filter(o => (o.pnl || 0) > 0);
  const gp = wins.reduce((s, o) => s + o.pnl, 0);
  const gl = Math.abs(list.filter(o => (o.pnl || 0) <= 0).reduce((s, o) => s + o.pnl, 0));
  return {
    closed: list.length,
    net: Math.round(list.reduce((s, o) => s + (o.pnl || 0), 0) * 100) / 100,
    win_rate: list.length ? Math.round((wins.length / list.length) * 1000) / 10 : 0,
    profit_factor: gl > 0 ? Math.round((gp / gl) * 100) / 100 : gp > 0 ? 99 : 0,
    gross_profit: Math.round(gp * 100) / 100,
  };
}

export async function GET() {
  const kv = getKv();
  await ensureSeed(kv, new Date().toISOString());
  const [meta, account, market, closedAll, openMap, blocked, days, strategies] = await Promise.all([
    repo.meta(kv), repo.account(kv), repo.market(kv), repo.closedOps(kv, 2000), repo.openOps(kv),
    repo.blockedOps(kv, 200), repo.targetDays(kv), repo.strategies(kv),
  ]);
  const open = Object.values(openMap);
  const sum = summarize(account, open as any, market?.prices || {});
  const all = stat(closedAll);
  const last250 = stat(closedAll.slice(-250));
  const reasons: Record<string, number> = {};
  blocked.forEach((o: any) => { const key = (o.risk_note || "?").slice(0, 70); reasons[key] = (reasons[key] || 0) + 1; });
  const dayRows = Object.entries(days).map(([day, v]: any) => ({ day, ...v })).sort((a, b) => a.day.localeCompare(b.day));
  const green = dayRows.filter(d => d.pnl > 0).length;
  const worst = dayRows.length ? Math.min(...dayRows.map(d => d.pnl)) : 0;
  const validations = Object.values(strategies).filter((s: any) => s.validation?.ready).length;
  const verdict = all.closed < 30 ? "muestra insuficiente (faltan trades)"
    : all.net > 0 && all.profit_factor > 1.2 ? "consistente en paper real (pendiente forward 28d)"
      : "no consistente";
  return json({
    generated_at: new Date().toISOString(),
    mode: "paper-real", market: "spot", source: "binance",
    costs_cfg: { spot_taker: SPOT_TAKER, half_spread_pairs: HALF_SPREAD, slip: SLIP, nota: "todo market, 0,10% por lado + spread + slippage" },
    trades: {
      closed: all.closed, open: open.length, blocked: blocked.length,
      block_rate: all.closed + open.length + blocked.length ? `${Math.round((blocked.length / (all.closed + open.length + blocked.length)) * 1000) / 10}%` : "0%",
    },
    // Cumulativo real desde el arranque v2 (hasta 2000 cierres), no una ventana.
    net: Math.round((sum.realized - sum.base) * 100) / 100,
    expenses: sum.feesPaid,
    fees_paid: sum.feesPaid,
    realized: sum.realized,
    unrealized: sum.unrealized,
    equity: sum.equity,
    cash: sum.cash,
    base: sum.base,
    today: meta.dayPnl,
    total: Math.round((sum.equity - sum.base) * 100) / 100,
    win_rate: `${all.win_rate}%`,
    profit_factor: all.profit_factor,
    sharpe: 0,
    trades_all: all,
    window_250: { ...last250, label: "últimos 250 cierres (solo para diagnóstico, no para el total)" },
    days: dayRows.length,
    green_days: dayRows.length ? `${green}/${dayRows.length}` : "-",
    worst_day: Math.round(worst * 100) / 100,
    day_list: dayRows.slice(-30),
    block_reasons: reasons,
    validated_strategies: validations,
    verdict,
    audit_tail: (await repo.audit(kv, 5)).map((a: any) => a.ev),
  });
}
