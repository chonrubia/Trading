# Changelog — AI Trading Floor

## [Unreleased]
- F2 completado: app Next.js `web/` con 30 rutas API (mismo shape), repo KV particionado (`MemoryKv` + `UpstashKv` REST con fallback `REDIS_URL`), locks anti-doble-ejecución, seed determinista 176 agentes. 14/14 tests lib + 22/22 backend en verde. Hallazgo: Next duplica módulos por ruta en memoria (solo afecta al fallback local, no a Upstash).

## SDD base

## 2026-10-02 — Motor en la nube + web viva
- Rama `engine-state` cada 2h (100→60 ticks, ~1500/2000 min/mes), web solo-lectura con edad y cuenta atrás, deriva visual honesta.
- Aprendizaje Fase 8: mercado con regímenes, entradas direccionales, expectancy en R, XP con efecto real, cooldown.

## 2026-10-01 — Fondo 500€ paper + oficina iso + fases 1-7
- Modelo de datos, 176 agentes, chat, ranking, departamentos, riesgos paper, comité, memoria, escuela, incubadora, mesas (arb/derivados/cobertura), costes taker+spread, objetivo 50€/día, sin stops por pérdidas.
