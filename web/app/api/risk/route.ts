import { getKv, json } from "../../../lib/kv.js";
import { repo, ensureSeed, metaStale } from "../../../lib/state.js";
import { SPOT_LIMITS } from "../../../lib/risk.js";
import { summarize } from "../../../lib/accounting.js";

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const revalidate = 0;

export async function GET() {
  const kv = getKv();
  await ensureSeed(kv, new Date().toISOString());
  const [meta, account, market, openMap, closed, blocked] = await Promise.all([
    repo.meta(kv), repo.account(kv), repo.market(kv), repo.openOps(kv),
    repo.closedOps(kv, 2000), repo.blockedOps(kv, 200),
  ]);
  const open = Object.values(openMap);
  const sum = summarize(account, open as any, market?.prices || {});
  return json({
    limits: {
      ...SPOT_LIMITS,
      max_day_loss_eur: SPOT_LIMITS.max_day_loss,
      max_drawdown_pct: SPOT_LIMITS.max_drawdown,
      max_exposure_gross: SPOT_LIMITS.max_exposure_pct,
    },
    market: "spot",
    shorting: false,
    max_leverage: 1,
    kill: meta.kill, dayHalt: !!meta.dayHalt, halt_reason: meta.halt_reason || "",
    exposure: sum.exposurePct, dayPnl: meta.dayPnl, drawdown: meta.drawdown,
    open: open.length, blocked: blocked.length, suspended: meta.suspended,
    cash: sum.cash, equity: sum.equity, realized: sum.realized, unrealized: sum.unrealized,
    fees: sum.feesPaid, trades: sum.trades,
    source: "binance", stale: metaStale(meta), last_candle_ts: meta.last_candle_ts || null,
    closed: closed.length,
  });
}
