# Tareas — SPEC-001 (marcar [x] al completar con evidencia)

## F0
- [x] T01 Caracterización `costs` (tabla dorada al céntimo) — 3 tests verdes
- [x] T02 Caracterización `risk.checkOperation` (matriz de decisión) — 8 tests verdes
- [x] T03 Caracterización `desks` puras (arbPnl, arbCostPct, hedgeSignal, deskPnl) — 5 tests verdes
- [x] T04 Caracterización `incubator` pura (ema/rsi/runTrades/metrics/qualify/liveSignal) — 6 tests verdes

## F1
- [x] T10 Estructura `lib/` TS + seams rng/clock/store (`lib/rng.ts`, `tsconfig.lib.json`)
- [x] T11 Port costs + tests F0 en verde
- [x] T12 Port risk-pure + tests en verde
- [x] T13 Port desks-pure + tests en verde
- [x] T14 Port incubator-pura + tests en verde (robustness determinista con seed)

## F2
- [ ] T20 Repositorio de estado particionado (fake KV en tests)
- [ ] T21 Routes GET (mismo shape que la UI espera)
- [ ] T22 Routes POST con lock por slot (chat, propose, kill, suspend, comité, memoria, incubadora)
- [ ] T23 `GET /api/floor` agregado + contrato validado

## F3
- [ ] T30 `step()` con orden del loop + idempotencia por slot
- [ ] T31 Determinismo: 2 corridas misma seed idénticas
- [ ] T32 Comité, incubadora, mesas y escuela sobre el estado
- [ ] T33 Seed 500€ frescos + primer latido verificado

## F4
- [ ] T40 UI contra `/api/*` por polling (reutilizar componentes)
- [ ] T41 Acciones remotas funcionando (H2)
- [ ] T42 Sin backend: error explícito, jamás demo silenciosa
- [ ] T43 Checklist dashboard Vercel (KV + cron) completado por el gestor

## F5
- [ ] T50 Semana de latidos ≥95% puntuales + cuotas bajo techo
- [ ] T51 Informe de consistencia del fondo en la nube
- [ ] T52 Tag `checkpoint/corte-web`, deploy reemplazado, CHANGELOG cerrado
