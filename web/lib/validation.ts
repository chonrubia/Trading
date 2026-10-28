// Puerta de validación forward: una sola fuente de verdad para /api/validation
// y para armar el modo live. Nada de dinero real con criterios incompletos.
import type { KvStore } from "./store.js";
import { repo, metaStale } from "./state.js";
import { summarize } from "./accounting.js";

const DAY = 86_400_000;
const dayOf = (iso: string) => iso.slice(0, 10);
const calendarDays = (a: string, b: string) => Math.max(0, Math.round((Date.parse(dayOf(b)) - Date.parse(dayOf(a))) / DAY));

export interface Readiness {
  ready_for_live: boolean;
  live_enabled: boolean;
  armed: boolean;
  armed_until: string | null;
  mode: string;
  source: string;
  days_forward: number;
  days_with_trades: number;
  trades_total: number;
  trades_today: number;
  equity: number;
  base: number;
  realized: number;
  unrealized: number;
  net: number;
  max_drawdown: number;
  worst_day: number;
  heartbeat_pct: number;
  tickN: number;
  validated_strategies: any[];
  criteria: Record<string, { ok: boolean; value: any }>;
  failed: string[];
  next_steps: string[];
  generated_at: string;
}

export async function liveReadiness(kv: KvStore): Promise<Readiness> {
  const [meta, account, market, openMap, closed, targetDays, strategies, arm] = await Promise.all([
    repo.meta(kv), repo.account(kv), repo.market(kv), repo.openOps(kv), repo.closedOps(kv, 2000),
    repo.targetDays(kv), repo.strategies(kv), repo.liveArm(kv),
  ]);
  const now = new Date().toISOString();
  const open = Object.values(openMap);
  const sum = summarize(account, open as any, market?.prices || {});
  const days = calendarDays(meta.created_at || now, now);
  const rows = Object.entries(targetDays).map(([day, v]: any) => ({ day, ...v }));
  const today = dayOf(now);
  const todayTrades = closed.filter((o: any) => o.closed_at?.slice(0, 10) === today).length;
  const daysWithTrades = rows.filter(r => (r.trades || 0) > 0).length + (todayTrades > 0 ? 1 : 0);
  const worstDay = Math.min(0, ...rows.map(r => Number(r.pnl) || 0), Number(meta.dayPnl) || 0);
  // Latido real sobre tiempo transcurrido (6 ticks/hora), no sobre días cerrados.
  const createdMs = Date.parse(meta.created_at || now) || Date.now();
  const elapsedMin = Math.max(0, (Date.now() - createdMs) / 60_000);
  const expectedTicks = Math.max(1, Math.round(elapsedMin / 10));
  const heartbeat = Math.min(100, Math.round((meta.tickN / expectedTicks) * 1000) / 10);
  const validated = Object.values(strategies).filter((s: any) => s.validation?.ready === true);
  const armed = !!arm?.armed && Date.parse(arm?.expires_at || "") > Date.now();

  const criteria = {
    days_28: { ok: days >= 28, value: days },
    days_with_trades_20: { ok: daysWithTrades >= 20, value: daysWithTrades },
    scenarios_validated_3: { ok: validated.length >= 3, value: validated.length },
    max_drawdown_20: { ok: (meta.drawdown || 0) < 20, value: meta.drawdown || 0 },
    worst_day_15: { ok: worstDay > -15, value: Math.round(worstDay * 100) / 100 },
    heartbeat_95: { ok: heartbeat >= 95, value: heartbeat },
    data_fresh: { ok: !metaStale(meta), value: meta.last_tick_at || meta.last_candle_ts || null },
  };
  const failed = Object.entries(criteria).filter(([, c]) => !c.ok).map(([k]) => k);
  return {
    ready_for_live: failed.length === 0,
    live_enabled: process.env.LIVE_TRADING_ENABLED === "true",
    armed,
    armed_until: armed ? arm.expires_at : null,
    mode: "paper-real", source: "binance",
    days_forward: days, days_with_trades: daysWithTrades,
    trades_total: closed.length, trades_today: todayTrades,
    equity: sum.equity, base: sum.base, realized: sum.realized, unrealized: sum.unrealized,
    net: Math.round((sum.realized - sum.base) * 100) / 100,
    max_drawdown: meta.drawdown, worst_day: Math.round(worstDay * 100) / 100,
    heartbeat_pct: heartbeat, tickN: meta.tickN,
    validated_strategies: validated.map((s: any) => ({ name: s.name, oos_net: s.validation.oos_net, oos_trades: s.validation.oos_trades, oos_pf: s.validation.oos_pf, wf: `${s.validation.wf_positive}/${s.validation.wf_total}` })),
    criteria, failed,
    next_steps: failed.length ? [
      failed.includes("days_28") ? `Faltan ${28 - days} días de paper real` : "",
      failed.includes("days_with_trades_20") ? `Faltan ${Math.max(0, 20 - daysWithTrades)} días con operaciones` : "",
      failed.includes("scenarios_validated_3") ? `Faltan ${Math.max(0, 3 - validated.length)} estrategias validadas (POST /api/backtest)` : "",
      failed.includes("heartbeat_95") ? "Latido por debajo del 95%: revisa el cron" : "",
    ].filter(Boolean) : ["Configurar claves Binance de solo trading", "Armar live con POST /api/live/arm"],
    generated_at: now,
  };
}
