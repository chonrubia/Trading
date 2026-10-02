# SPEC-001 — Fondo 100% web sin depender del PC

Estado: aprobada (base para implementación).

## 1. Problema (voz del usuario)
Quiero ver y usar mi fondo de trading con agentes desde cualquier dispositivo y a cualquier hora, sin que mi PC esté encendido, con todo publicado en mi GitHub y mi URL de Vercel. Hoy la web pública solo muestra una foto cada 2h + simulación local, y operar (chatear, comité, kill, proponer) exige el backend de mi PC.

## 2. Usuarios e historias
- **Gestor (yo)**: ver estado real en vivo, operar (chat, comité, kill, proponer, suspender) y revisar el informe, desde móvil o PC, con el ordenador apagado.
- **Invitado (amigos)**: ver la oficina viva en modo solo-lectura sin cuentas.

Historias + aceptación:
- H1 Ver estado: abrir la URL y ver patrimonio, posiciones, ranking y chat con datos del motor de ≤10 min. Aceptación: banner indica edad exacta del dato; nunca muestra simulación como real.
- H2 Operar en remoto: enviar chat, convocar/cerrar comité, kill switch, proponer trade. Aceptación: la acción queda reflejada en el siguiente latido (≤10 min) y en auditoría.
- H3 Ritmo: el motor avanza sin PC 24/7 dentro de cuotas gratis. Aceptación: ≥95% de latidos puntuales/semana, gasto Actions ≤1500 min/mes.
- H4 Sin regresiones: todo lo que hoy funciona en local (paper 500€, incubadora, mesas, escuela, memoria) sigue funcionando igual tras la migración.

## 3. Alcance / fuera de alcance
Dentro: motor serverless + estado persistente en la nube + API de acciones + frontend por polling + cron + seed inicial 500€ frescos. Fuera (fase 1): WebSockets en la nube, trading real, ticks cada 2s (el latido será de minutos), portar el fondo histórico del PC (empieza fresco).

## 4. Decisiones de arquitectura (del consejo)
- ADR-1: motor por pasos idempotentes con lock por slot (evita doble gasto entre cron y acciones humanas).
- ADR-2: estado particionado en KV (nada de blob gigante); histórico y auditoría completa a Blob.
- ADR-3: sin `Math.random/Date/fs` directos en `lib/` (rng/reloj/tienda inyectados) para determinismo y tests.
- ADR-4: reutilizar `costs/desks-puras/incubator-pura/risk` con tablas doradas que congelen su comportamiento actual.
- ADR-5: frontend por polling a `GET /api/floor`; prohibido el fallback silencioso a demo (error explícito si no hay dato).

## 5. Riesgos abiertos
- Frecuencia mínima real del cron en Hobby ([VERIFICAR] en dashboard: si es diaria, el latido lo da GitHub Actions como hoy).
- Comandos KV gratis/mes ([VERIFICAR] en Usage; mitigación: `GET /api/floor` agregado + `revalidate` 60s).
- Timeout de funciones (mantener cada tick <10s).
