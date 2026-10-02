# AI Trading Floor — ver demo pública en https://trading-three-hazel.vercel.app/
> La web pública arranca con una **foto real del motor** (`frontend/public/snapshot.json`,
> regenerada por GitHub Actions cada 6h con `backend/scripts/make-snapshot.js`) y sigue
> simulando en vivo en el navegador. Sin backend conectado muestra "DATOS DEL MOTOR REAL +
> SIMULACIÓN EN VIVO". Si abres la URL **en tu PC con el backend corriendo**, la web
> detecta sola `http://localhost:8765` y muestra datos 100% en vivo sin configurar nada
> (los navegadores permiten a páginas https llamar a localhost). Con `VITE_API_URL`
> apuntando a un backend público, en vivo desde cualquier dispositivo.

Replica del fondo de las capturas (`C:\Users\chonr\Desktop\trading`): fondo cripto con 156+ agentes IA en oficina virtual.

> Entorno actual: Node 24 sin Python. Fase 1 implementada en **Node.js + Express + WS** con la misma arquitectura/mismo modelo de datos propuestos para FastAPI. Migración a FastAPI/Postgres/Redis en Fase 3 sin cambiar contratos API.

## Fase 2 (anterior)
- Oficina isométrica PixiJS `frontend/src/IsoOffice.tsx` con parcelas por depto + sala comité + avatares con anillo de estado y lerp de movimiento.
- Comité: `POST /api/committee/start|end`, `GET /api/meetings`, WS `committee started/ended`, actas con top3 + decisiones.
- Riesgos paper `backend/src/risk.js`: límites fondo (-3000$ día, DD 10%, expo 150%, lev 5x, concentración 30%), `checkOperation` aprueba/ajusta/bloquea, kill-switch, suspensión traders, auto-trading paper con TP +2% / SL -1%.
- Paneles Ops y Riesgo + proponer trade desde perfil + ticker mercado.
- Verificado: `health fase:2`, risk/exposure/open, committee start→end con summary, propose OK, `tsc:0 build:0`.

## Fase 7.4 (actual: costes dinero-real + anti-frenesí)
- Costes Binance VIP0: spot taker 0.10%/lado, futuros 0.05%/lado + slippage 0.03% + medio spread por par (BTC/ETH 0.01% … NEAR 0.05%). Arbitraje paga 4 patas (~0.6%) y solo abre si el spread las cubre: como en real, casi no opera.
- Sin deriva ficticia: cada euro del PnL viene de operaciones cerradas.
- Anti-burst: máx 6 aperturas spot por tick; el historial conserva las últimas 250 cerradas (las bloqueadas ya no expulsan la muestra que enseña a los setups).
- Verificado: fees 0.05-0.12€ por trade (~0.3% RT), drag inicial 110% (los costes se comen el ruido), block-rate sano.
## Fase 7.3 (objetivo 50€/día + modo selectivo)
- `backend/src/target.js`: objetivo 50€, tope 3 trades/día/agente, puerta de calidad (expectancy del setup + régimen RISK-ON/OFF + anti-tilt tras pérdida, umbral 0.55). Al batir el objetivo se SIGUE en modo proteger-ganancias (8-20€, calidad 0.70, lev ≤2x) con aviso de Dirección en sala.
- Agujero tapado: el arbitraje saltaba a Riesgos (exposición 157% > 150%); ahora toda orden pasa por `checkOperation` salvo el hedge por mandato.
- `GET /api/target` (progreso, historial de días batidos) + `GET /api/setups` (expectancy neta por estrategia: avg/op, win%, muestra). Header con 🎯 progreso, tabla de setups en Lab.
- Incubadora endurecida: lista exige 50 ticks +4€ y DD<6%, tope 8 activas (antes promocionaba 11 en minutos con backtests sintéticos laxos).
- NOTA HONESTA: 50€/día sobre 500€ = 10% diario, insostenible como rutina (los mejores fondos hacen eso al año). Se usa como aspiración; el sistema prioriza expectancy y protege gains.
## Fase 7.2 (fondo real de 500€ en paper)
- Patrimonio base 500€ (`FUND_BASE`), límite diario -15€, todo recalibrado: spot 15-50€/trade, derivados ~25€, arbitraje 150€, cobertura 30% (auto), incubadas reciben 25€, suspensión/degradación a -7.5€ por agente, deriva de fondo insesgada ±0.11€.
- Moneda € en toda la UI y mensajes. Historial $ archivado en `backend/data/archive-*`; se conserva memoria + escuela (el entrenamiento no se pierde).
- Verificado al arrancar: 176 agentes en 0, 498.53€ tras primeros trades, Riesgos bloqueando al tocar -15€/día, costes fluyendo.
- `backend/src/costs.js`: 0.05% comisión + 0.03% slippage por lado (~0.16% round-trip) en TODOS los cierres (spot, derivados, cobertura, arb) + `estCosts` al abrir. Incubadora recalibrada a fee 0.0016.
- `GET /api/report`: neto/fees, WR, PF, Sharpe, días verdes, neto por desk, motivos de bloqueo, veredicto (`muestra insuficiente` / `consistente (provisional)` / `no consistente`).
- Persistencia de agentes incubados (`extra_agents.json`), snapshots de equity cada 60s, endurecimiento (uncaught→`run.log`, persist al salir, `health` con uptime/ticks/lastError).
- Hallazgos 01-oct: neto -38$ en 225 trades, WR 20.4%, PF 0.78, costes 41$ (drag 30.6%) → de momento ruido menos costes, NO consistente. Riesgos verificado: ballena 50 BTC bloqueada, 20x recortado a 5x, kill bloquea todo. Bug `block_rate NaN%` encontrado y corregido.
- Paper continuo: `Start-Process node -ArgumentList 'src/index.js' -WorkingDirectory backend -WindowStyle Hidden`; vigilar `/api/health` (uptime, lastError) y `/api/report` (veredicto válido con ≥5 días).

## Fase 7 (mesas — arbitraje, derivados, coberturas)
- `backend/src/desks.js`: venues duales A/B con spread (random walk + shocks), `scanArb` (umbral 0.15%, máx 3), PnL por captura de spread, `hedgeSignal` (expo>80% o DD>3% abre, expo<50% y DD<1.5% cierra), PnL por desk.
- Arbitraje: LONG venue barato / SHORT caro, nocional 2000$, cierra con spread <0.05% o timeout; asignado a mesa Arbitraje con XP.
- Derivados: futuros BTC/ETH con apalancamiento 3-5x validados por Riesgos + funding accrual por tick; pasan por el mismo seguimiento con TP/SL.
- Coberturas: hedge SHORT BTC 30% patrimonio por mandato de Riesgos (salta el filtro de concentración), se cierra al normalizar.
- `GET /api/desks` (spreads, funding, arb/deriv abiertos, hedge, PnL por desk), `/api/operations?desk=`, auditoría `arb.open/close deriv.open hedge.open/close`.
- Frontend: tab Mesas + etiqueta de desk en Ops.
- Verificado: 3 arbs DOGE abiertos (tope), futuros con fundingAcc, PnL por desk (spot/arb/deriv), `arb.close` en audit, `tsc:0 build:0`.
- `backend/src/incubator.js`: minero (EMA/RSI/Donchian × pair × params) → backtest en histórico sintético (umbral: trades>10, total>0, sharpe>0.2) → robustez 4 tests (folds 2/3, OOS, Monte Carlo 120 sims >60%, sensibilidad ±10%; pass 3/4) → incubación paper live sobre buffer de ticks (TP +1.5% / SL -0.8%) → lista (30 ticks, +15$, DD<8%) → activa con 500$ (crea agente trader) → degradación (agente <-150$ retira + suspende).
- Auto-mine cada 6 ticks, auto-promoción (tope 12), `GET /api/incubator|/stats`, `POST /api/incubator/mine|/:id/promote|/:id/retire`, WS `incubator`.
- Frontend: tab Lab (stats, Minar 5, tabla con BT/robustez/paper, Dar capital / Retirar).
- Verificado: minado 5 → 3 incubación + 2 descartadas, métricas reales, `tsc:0 build:0`.
## Fase 6 (incubadora)
## Fase 3 (persistencia + memoria + escuela)
- `backend/src/store.js`: JSON en `backend/data/` (operations, meetings, messages, agents_pnl, memory, school_*) + `audit.log` append-only. Hidratación al arrancar, guardado cada 10s.
- `backend/src/memory.js`: memoria compartida `GET/POST /api/memory` (+ búsqueda `?q=`), WS `memory`, citada por agentes en chat y guardada al cerrar comité.
- `backend/src/school.js`: XP por cierre (`tecnico/riesgo/psicologia`), `GET /api/school/leaderboard|/agent/:id`, mentoring top→peor en cada comité, visible en perfil.
- Auditoría: `GET /api/audit` — propose/close/kill/suspend/committee/memory.
- Frontend: tab Learn (memoria + aportar + escuela + auditoría), XP en perfil.
- Verificado: `fase:3`, memory post+list, school leaderboard, propose, `op.close` en audit, 8 ficheros en data, `tsc:0 build:0`.
- Limitación honesta incubadora: histórico sintético con tendencias fuertes infla sharpes (13-15) y win rates (~80%); con datos reales CCXT habría que recalibrar umbrales.

## Arquitectura detallada (objetivo final)

```
[Frontend React+TS Canvas/Pixi] <--WS/REST--> [API FastAPI/Express :8765]
        |                                            |-- engine/market (simulado -> CCXT)
        |                                            |-- engine/agents (mock -> LLM por rol)
        |                                            |-- engine/bus (EventEmitter -> Redis pub/sub)
        |                                            |-- engine/risk (Fase 3)
        |                                            |-- engine/school (Fase 5)
        |-- Postgres (agentes, ops, métricas)  [Fase1: JSON memoria, misma schema]
        |-- Redis (estado realtime + mensajería) [Fase1: EventEmitter en proceso]
```

## Esquema DB (Fase 1 implementado en memoria, migrable a Postgres)

```
departments(id, slug, name, zone_x, zone_y, description)
agents(id, name, role, department_id, avatar_seed, strategy, pair, timeframe, risk_level, leverage, capital_assigned, status, mood, level_risk, level_ta, studying, pnl, win_rate, profit_factor, drawdown, trades_count)
channels(id, slug, name, department_id NULL=general)
messages(id, channel_id, from_agent_id NULL=humano, to_agent_id NULL, text, kind[idea|analisis|alerta|social|respuesta], created_at)
operations(id, agent_id, pair, side[LONG|SHORT], entry, exit NULL, size, leverage, pnl NULL, status[propuesta|bloqueada|abierta|cerrada], risk_check JSON, reason, opened_at, closed_at)
portfolio_snapshots(ts, equity, day_pnl, exposure_gross, drawdown)
risk_limits(id, scope[fondo|departamento|agente], max_day_loss, max_drawdown, max_exposure, max_leverage, updated_at)
meetings(id, topic, summary JSON, started_at, ended_at)          // Fase 4
learnings(id, agent_id, subject, delta, note, created_at)        // Fase 5
strategies(id, name, source[minero|manual], params JSON, backtest JSON, status[incubacion|activa|retirada]) // Fase 6
```

Flujo operación Fase 1-3: `idea trader -> validación riesgos (mock aprueba/bloquea) -> ejecución paper -> seguimiento tick -> cierre -> registro + aprendizaje`.

## Correr Fase 1

```powershell
cd backend; npm install; npm start
# API http://localhost:8765  WS ws://localhost:8765/ws/floor
cd ../frontend; npm install; npm run dev
# UI http://localhost:5173
```

Endpoints: `GET /api/health /api/portfolio /api/market /api/departments /api/agents /api/agents/:id /api/ranking?period=day /api/channels /api/channels/:id/messages` `POST /api/chat` `GET /ws/floor`
