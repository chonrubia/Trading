import { getKv, json } from "../../../lib/kv.js";
import { repo, ensureSeed, metaStale } from "../../../lib/state.js";
import { summarize } from "../../../lib/accounting.js";
import { DAILY_TARGET_EUR } from "../../../lib/engine.js";

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const revalidate = 0;

export async function GET() {
  const kv = getKv();
  await ensureSeed(kv, new Date().toISOString());
  const [meta, account, market, openMap, closed] = await Promise.all([
    repo.meta(kv), repo.account(kv), repo.market(kv), repo.openOps(kv), repo.closedOps(kv, 2000),
  ]);
  const open = Object.values(openMap) as any[];
  const prices = market?.prices || {};
  const sum = summarize(account, open as any, prices);
  return json({
    patrimonio: sum.equity,
    moneda: "EUR",
    base: sum.base,
    efectivo: sum.cash,
    realizado: sum.realized,
    no_realizado: sum.unrealized,
    resultado_total: Math.round((sum.equity - sum.base) * 100) / 100,
    resultado_hoy: Math.round(meta.dayPnl * 100) / 100,
    caida: meta.drawdown,
    exposicion_bruta: sum.exposurePct,
    posiciones: open.length,
    costes_pagados: sum.feesPaid,
    trades: sum.trades,
    win_rate: sum.winRate,
    profit_factor: sum.profitFactor,
    objetivo: DAILY_TARGET_EUR,
    progreso: `${Math.round((meta.dayPnl / DAILY_TARGET_EUR) * 1000) / 10}%`,
    freno_riesgos: !!meta.dayHalt,
    mode: "PAPEL REAL · BINANCE SPOT 1x",
    market_source: "binance",
    stale: metaStale(meta),
    last_candle_ts: meta.last_candle_ts || null,
    kill: meta.kill,
    closed: closed.length,
  });
}
