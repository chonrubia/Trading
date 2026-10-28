# Plan — SPEC-002 (mercado real + paper + live controlado)

## F0 — Congelar y aislar (puerta: tests base verdes)
- Mantener SPEC-001 intacta; el estado v2 arranca fresco.
- Tests de caracterización de costes/contabilidad actuales antes de tocar.
- Feature flag explícito: `ENGINE_MODE=paper-real | live | synthetic` (synthetic solo tests/local).

## F1 — Datos reales Binance (puerta: /api/market coincide con Binance)
- `binance.ts`: ticker 24h, klines, funding, fear&greed; fetch inyectable.
- `market-real.ts`: snapshot, validación de frescura, series por par/timeframe.
- Persistencia de velas cerradas en KV v2; backfill inicial.
- `POST /api/tick`: si no hay dato real fresco → 503 y no avanza.
- `GET /api/health|market`: fuente, timestamps, stale.

## F2 — Paper spot 1x realista (puerta: PnL reconstruible al céntimo)
- `broker.ts` + `PaperBroker`: fills con spread/slippage, fee 0,10 % por lado.
- `accounting.ts`: cash, realized, unrealized, equity, day PnL.
- Motor: solo LONG spot, leverage 1; señales SHORT = no abrir/cerrar.
- Desactivar derivados/arbitraje/cobertura sintéticos en modo real.
- Reset v2 + banner de modo en UI.

## F3 — Backtest real (puerta: sin lookahead y OOS)
- `backtest.ts` OHLC: señal en cierre i, entrada en open i+1, TP/SL/timeout, costes.
- `strategies.ts`: specs del seed (ema/rsi/donchian, p1, tf, pair).
- `POST /api/backtest`: IS/OOS, 5 folds walk-forward, Monte Carlo, veredicto.
- UI de validación: tabla de estrategias y `ready_for_live`.

## F4 — Forward paper 28 días (puerta: H6)
- Cron 10 min con datos reales; informe diario.
- `GET /api/validation`: días, trades, DD, días malos, latido.
- No se toca dinero real hasta cumplir H6.

## F5 — Live Binance spot (puerta: armado + límites + auditoría)
- `BinanceSpotBroker`: firmas HMAC, market orders, min notional.
- `POST /api/live/arm` con `CRON_SECRET`; ventana de 15 min.
- Límites duros: 3 posiciones, 10 €/orden, -15 €/día, DD 30 %.
- `GET /api/live/status`, kill switch, auditoría de órdenes.
- Región Vercel EU y claves sin retirada.

## F6 — Corte
- `tsc:0`, build, tests, tick real, backtest real, deploy, CHANGELOG, tag.
