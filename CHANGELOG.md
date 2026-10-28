# Changelog — AI Trading Floor

## [Unreleased]
- **2026-10-28 — SPEC-002: mercado real, paper y puerta a live.** El motor deja el mercado sintético y trabaja con precios públicos de Binance (`data-api.binance.vision`). Fondo v2 de 60 € aislado en `fund:v2:*`; el estado `fund:*` antiguo queda archivado.
- Datos reales: 12 pares spot EUR (BTC, ETH, SOL, XRP, BNB, DOGE, ADA, AVAX, LINK, NEAR, TRX, LTC), velas 15m/1h/4h/1d, tickers, funding y Fear&Greed best-effort. `/api/tick` devuelve 503 si Binance falla o el dato supera 15 min; nunca cae a datos inventados.
- Contabilidad spot 1x: taker 0,10 % por lado + medio spread + slippage; `equity = cash + posiciones`, `realized = 60 + PnL cerrado`, `unrealized = equity - realized`. Solo LONG, máx. 3 posiciones, 10 €/orden, -15 €/día, DD 30 %, exposición 60 %.
- Validación: `POST /api/backtest` con histórico real, IS/OOS 70/30, 5 folds walk-forward, Monte Carlo y veredicto honesto. `GET /api/validation` exige 28 días, 20 con trades, 3 estrategias validadas, DD < 20 %, peor día > -15 €, latido ≥ 95 % y datos frescos.
- Live: `BinanceSpotBroker` firmado (HMAC, market orders, min notional) y endpoints `/api/live/status|arm|kill` con `CRON_SECRET`, confirmación `ARM LIVE` y ventana de 15 min. **La ejecución real NO está cableada al motor todavía**: el armado es preflight y ninguna orden real puede salir en esta versión.
- Informe y UI: banner de fuente/frescura, pestaña Validación, realizado/no realizado, costes pagados, límites spot y mesas sintéticas desactivadas.
- Resultado del primer backtest real: **0 de 10 estrategias validadas** (fallan OOS, PF y/o walk-forward). Se quedan en paper; no se promociona ninguna.
- Verificación: `tsc` 0 errores, 28/28 tests, `next build` OK, tick real contra Binance OK (3 posiciones, 50 % exposición, 59,96 € tras 0,03 € de costes), `/api/validation` con `ready_for_live:false`.
- F3 completado: `step()` determinista (mercado con regímenes, scoring R, tiers, cooldown, comité, incubadora, mesas, escuela, memoria), `POST /api/tick` con lock + dedup, 5/5 tests engine. Mercado persiste entre rachas.
- F4 (código) completado: UI web total con polling + acciones remotas, ticker `engine-web.yml` cada 30 min (~1440/2000 min/mes), KV explícito sin fallback silencioso. Pendiente solo dashboard (T43).

## SDD base

## 2026-10-02 — Motor en la nube + web viva
- Rama `engine-state` cada 2h (100→60 ticks, ~1500/2000 min/mes), web solo-lectura con edad y cuenta atrás, deriva visual honesta.
- Aprendizaje Fase 8: mercado con regímenes, entradas direccionales, expectancy en R, XP con efecto real, cooldown.

## 2026-10-01 — Fondo 500€ paper + oficina iso + fases 1-7
- Modelo de datos, 176 agentes, chat, ranking, departamentos, riesgos paper, comité, memoria, escuela, incubadora, mesas (arb/derivados/cobertura), costes taker+spread, objetivo 50€/día, sin stops por pérdidas.
