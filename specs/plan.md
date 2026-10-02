# Plan de implementación — SPEC-001

## F0 Congelar comportamiento (puerta: >30 asserts verdes)
- Tests de caracterización `node:test` sobre `costs`, `risk.checkOperation`, `desks` puras e `incubator` pura. Congelan números actuales.

## F1 Lib puro y determinista (puerta: 100% F0 verde contra `lib/`, diff 0)
- Portar a TS sin I/O ni azar directo: costs, risk-pure, desks-pure, indicators/backtest de incubator.
- Seams `rng/clock/store` inyectados. Prohibido `Math.random/Date/fs` en `lib/`.

## F2 API + estado (puerta: roundtrip KV fake, contrato JSON = lo que espera la UI)
- Repositorio de estado particionado + Route Handlers `GET/POST /api/*` con el mismo shape actual.
- Lock por slot, IDs deterministas, `GET /api/floor` agregado.

## F3 Motor por pasos (puerta: 2 corridas con misma seed idénticas)
- `step()` con el orden del loop actual adaptado a minutos; comité, incubadora, mesas y escuela sobre el estado.
- Seed inicial: fondo fresco 500€.

## F4 UI web total (puerta: sin backend la UI muestra error explícito, nunca demo silenciosa)
- Frontend contra `/api/*` por polling; acciones remotas (chat, comité, kill, proponer, suspender).
- Requiere en dashboard Vercel: store KV conectado + cron activo (checklist en spec).

## F5 Verificación y corte (puerta: H1–H4 de la spec en verde)
- Latidos puntuales 1 semana, cuotas bajo techo, informe de consistencia, tag `checkpoint/corte-web` y reemplazo del deploy.
