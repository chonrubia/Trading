# SPEC-002 — Mercado real, paper honesto y ejecución real controlada

Estado: **aprobada** (decisiones del gestor, 2026-10-28).

## 1. Problema (voz del usuario)
Quiero que el fondo deje de operar sobre un mercado inventado. Quiero precios reales de Binance para saber si las estrategias funcionan de verdad, validarlas primero en paper con costes reales y, solo si pasan, poder operar con dinero real (50–60 €) con límites de riesgo claros.

## 2. Decisiones del gestor
- Exchange: **Binance**.
- Fase inicial: **datos reales + paper**; el dinero real se activa después, nunca en el mismo cambio.
- Mercado: **spot 1x**, sin cortos, sin futuros, sin apalancamiento en la fase real.
- Capital real previsto: **50–60 €**.
- Pérdida máxima diaria real: **-15 €** (el gestor la acepta; queda configurable).
- Nada de modo demo silencioso: si Binance no responde, el motor se detiene y la UI lo dice.

## 3. Historias y criterios de aceptación

### H1 — Datos reales
Al abrir la web, el patrimonio, precios, posiciones y PnL se calculan con velas y precios de Binance, no con `tickMarket()`.
Aceptación:
- `GET /api/health` devuelve `market_source:"binance"`, `last_candle_ts`, `stale:false`, `mode:"paper-real"`, `engine:"v2"`.
- `GET /api/market` devuelve precio, cambio 24h y funding de Binance; el precio de BTC difiere <0,5 % del ticker público en la misma ventana.
- Si Binance falla o el último dato tiene >15 min, `POST /api/tick` responde 503 y **no** avanza el estado. La UI muestra “SIN DATOS REALES” y no simula.
- Prohibido usar `tickMarket()` como fallback en producción.

### H2 — Paper con costes reales
Cada operación paper se ejecuta como una orden spot a mercado:
- Entrada/salida con medio spread + slippage del par.
- Comisión taker 0,10 % por lado sobre el nocional **real** (sin multiplicar por apalancamiento porque no hay apalancamiento).
- Sin comisiones negativas, sin deriva, sin PnL no explicado.
Aceptación:
- Para cada operación cerrada: `pnl = (exit_fill - entry_fill) * qty - fees` con error <0,01 €.
- `equity = cash + valor de mercado de posiciones abiertas`; `realized = 60 + suma(PnL cerrado)`; `unrealized = equity - realized`. La base paper v2 es 60 € (el capital real previsto es 50-60 €).
- El informe separa realized/unrealized y PnL de hoy/acumulado.

### H3 — Solo spot 1x
En modo real-data paper y en modo live:
- Solo se abren LONG con spot.
- `leverage = 1`; las señales SHORT se traducen en “no abrir” o “cerrar LONG”, nunca en una posición corta.
- Las mesas de derivados, arbitraje y cobertura sintéticas quedan desactivadas y etiquetadas como “no disponibles en modo real”.
Aceptación:
- `GET /api/risk` devuelve `max_leverage:1`, `market:"spot"`, `shorting:false`.
- El motor rechaza/bloquea cualquier propuesta con `side:"SHORT"` o `leverage>1` en modo real.

### H4 — Backtest real sin lookahead
Las estrategias se validan con velas históricas de Binance y ejecución en la apertura de la vela siguiente, no en el cierre de la vela de señal.
Aceptación:
- `POST /api/backtest` (o `npm run backtest`) descarga klines, ejecuta y devuelve: trades, net, win %, PF, Sharpe, max DD, expectancy R, resultado IS/OOS y walk-forward.
- Una señal en la vela `i` solo puede ejecutarse en `i+1`; el test lo verifica con un caso construido.
- Se aplican comisión, spread y slippage a entrada y salida.
- Una estrategia se marca `validada` solo si: OOS neto > 0 tras costes, ≥30 trades OOS, PF > 1,2, max DD < 20 % y ≥4/5 folds walk-forward positivos. Si no, `no validada`.

### H5 — Dinero real solo con activación explícita
El adaptador live de Binance spot existe, pero está **desactivado por defecto**.
Aceptación:
- Sin `LIVE_TRADING_ENABLED=true` y sin `POST /api/live/arm` con `CRON_SECRET`, ninguna orden real se envía.
- Claves: `BINANCE_API_KEY` / `BINANCE_API_SECRET`, con permiso solo de trading y sin retirada. Si faltan, error explícito; nunca paper silencioso.
- Límites live: capital 50–60 €, máx. 3 posiciones, máx. 10 € por orden, pérdida diaria -15 €, drawdown máximo 30 %, kill switch inmediato.
- Cada orden real queda en auditoría con `orderId`, `clientOrderId`, `fills`, `fees`, `status`.
- Si el mercado está stale, el kill switch activo o se supera un límite, no se envía ninguna orden.

### H6 — Validación forward antes de dinero real
El modo live no se arma hasta que el paper real lleve **≥28 días naturales** con datos reales y el informe muestre:
- ≥20 días con operaciones,
- OOS/walk-forward en verde,
- max DD < 20 %,
- ningún día con pérdida > -15 €,
- latido ≥95 %.
Aceptación: `GET /api/validation` devuelve `ready_for_live:false` hasta que se cumplan todos los criterios.

## 4. Alcance
Dentro:
- Cliente Binance público (tickers, klines, funding, fear & greed).
- Estado v2 aislado (`fund:v2:*`) con fondo paper fresco; el estado sintético antiguo se conserva archivado y no se mezcla.
- Motor de paper spot 1x con contabilidad realista.
- Backtester OHLC + walk-forward + informe de validación.
- Adaptador live Binance spot desactivado por defecto, con armado manual y límites.
- UI con banner de modo, fuente, antigüedad del dato, realized/unrealized y validación.

Fuera:
- Futuros, margen, cortos y apalancamiento con dinero real.
- Retiradas o transferencias.
- Trading de alta frecuencia o sub-minuto.
- Prometer rentabilidad; el sistema solo valida o descarta estrategias.

## 5. Arquitectura y costuras (seams)
- `web/lib/binance.ts`: funciones puras de parseo + fetch inyectable. Tests con fixtures de klines/ticker.
- `web/lib/market-real.ts`: construye `MarketSnapshot` desde Binance; valida frescura; sin fallback.
- `web/lib/broker.ts`: interfaz `Broker` (`paper` y `binance-spot`). El motor no habla con Binance directamente.
- `web/lib/accounting.ts`: cash, realized, unrealized, equity, fees y PnL diario. Funciones puras.
- `web/lib/backtest.ts`: OHLC, señal en cierre, ejecución en siguiente apertura, TP/SL/timeout, costes.
- `web/lib/strategies.ts`: registro de estrategias del seed y mineras con `kind`, `p1`, `tf`, `pair`, `style`.
- `web/app/api/tick/route.ts`: orquesta fetch → step → broker → persistencia; idempotente por slot.
- `web/app/api/live/*`: armado, estado y kill; solo servidor.
- Estado: `repo` con prefijo `fund:v2:`; migración de seed y archivo del estado anterior.

## 6. Riesgos y mitigaciones
- **Capital pequeño**: 50–60 € con Binance min notional puede limitar a 1–3 posiciones. Mitigación: tamaño mínimo 5 €, máximo 3 posiciones, filtro de pares con min notional compatible.
- **-15 €/día sobre 50–60 € es un 25–30 %**: se implementa como límite duro, pero se avisa por escrito. Recomendación: empezar con -5 €/día.
- **Binance geobloqueo**: Vercel debe ejecutar en región EU (`fra1`/`cdg1`) y el país de la cuenta debe permitir Binance. Si no, el modo live falla explícito.
- **Claves API**: solo trading, sin retirada, IP restringida; nunca en el cliente ni en logs.
- **Datos stale**: si el último candle tiene >15 min, no se opera.
- **Sobreajuste**: el backtest se evalúa OOS/walk-forward; no se promociona una estrategia por IS.

## 7. Criterio de corte de esta spec
- `tsc:0`, `next build` OK, tests nuevos verdes.
- `/api/health` y `/api/market` con datos reales verificados contra Binance.
- Un tick real completo sin fallback sintético.
- Backtest reproducible con un fixture y con datos reales.
- `GET /api/validation` en `ready_for_live:false`.
- CHANGELOG + tag `checkpoint/spec-002`.
