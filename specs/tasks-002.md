# Tareas — SPEC-002 (marcar [x] con evidencia)

## F1 Datos reales
- [x] T201 `web/lib/binance.ts`: parseo klines/ticker, fetch inyectable, tests con fixtures. Evidencia: `lib/test/real.test.ts` (parseo, agregación, stale).
- [x] T202 `web/lib/market-real.ts`: snapshot, series por par/timeframe, frescura, tests. Evidencia: `buildRealMarket` + `fixtureMarket` en engine tests.
- [ ] T203 Persistencia KV v2 de velas cerradas + backfill inicial. Parcial: se persiste el resumen y buffers 1h; el histórico completo se descarga bajo demanda en `/api/backtest` (no se guardan 24k velas en KV).
- [x] T204 `/api/tick` con datos reales, 503 si stale, sin fallback sintético. Evidencia: tick real local 2026-10-28.
- [x] T205 `/api/health` y `/api/market` con fuente/timestamps/stale. Evidencia: `source:"binance"`, `metaStale` recalculado al leer.

## F2 Paper realista
- [x] T210 `web/lib/broker.ts` + `PaperBroker` spot 1x con spread/slippage/fee.
- [x] T211 `web/lib/accounting.ts`: cash/realized/unrealized/equity/dayPnl + tests. Evidencia: identidad exacta en `real.test.ts`.
- [x] T212 Motor solo LONG, leverage 1; short = no abrir/cerrar; sin mesas sintéticas.
- [x] T213 Seed v2 y reset aislado; archivo del estado sintético. Evidencia: `fund:v2:*`, `FUND_BASE=60`.
- [x] T214 UI: banner modo/fuente/antigüedad, realized vs unrealized, PnL hoy vs total.

## F3 Backtest real
- [x] T220 `web/lib/backtest.ts` OHLC sin lookahead + costes + tests.
- [x] T221 `web/lib/strategies.ts` specs del seed y mineras.
- [x] T222 `POST /api/backtest` IS/OOS/walk-forward/MC.
- [x] T223 UI validación + `GET /api/validation`.

## F4 Forward
- [x] T230 Cron real 10 min + informe diario. Evidencia: `engine-web.yml` cada 10 min; `/api/report`.
- [ ] T231 28 días de paper real; `ready_for_live` solo si H6. Pendiente: el contador arranca con el primer tick v2 en producción.

## F5 Live
- [x] T240 `BinanceSpotBroker` firmado, market orders, min notional.
- [x] T241 `/api/live/arm|status|kill` con `CRON_SECRET` y ventana.
- [ ] T242 Límites duros y auditoría de órdenes. Parcial: límites y armado hechos; la ejecución real no está cableada, así que aún no hay órdenes reales que auditar.
- [ ] T243 Región EU + claves sin retirada + prueba testnet/paper. Pendiente: configurar claves en Vercel y probar; nunca pegarlas en el chat.

## F6 Corte
- [x] T250 `tsc:0`, build, tests, CHANGELOG, tag `checkpoint/spec-002`. Evidencia: 28/28 tests, build OK, tick real, `ready_for_live:false`.
