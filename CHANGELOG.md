# Changelog — AI Trading Floor

## [Unreleased]
- F3 completado: `step()` determinista (mercado con regímenes, scoring R, tiers, cooldown, comité, incubadora, mesas, escuela, memoria), `POST /api/tick` con lock + dedup, 5/5 tests engine. Mercado persiste entre rachas.
- F4 (código) completado: UI web total con polling + acciones remotas, ticker `engine-web.yml` cada 30 min (~1440/2000 min/mes), KV explícito sin fallback silencioso. Pendiente solo dashboard (T43).

## SDD base

## 2026-10-02 — Motor en la nube + web viva
- Rama `engine-state` cada 2h (100→60 ticks, ~1500/2000 min/mes), web solo-lectura con edad y cuenta atrás, deriva visual honesta.
- Aprendizaje Fase 8: mercado con regímenes, entradas direccionales, expectancy en R, XP con efecto real, cooldown.

## 2026-10-01 — Fondo 500€ paper + oficina iso + fases 1-7
- Modelo de datos, 176 agentes, chat, ranking, departamentos, riesgos paper, comité, memoria, escuela, incubadora, mesas (arb/derivados/cobertura), costes taker+spread, objetivo 50€/día, sin stops por pérdidas.
