# Prompt del proyecto (metodología spec-driven)

Úsalo para pedir cambios. El agente debe seguirlo al pie de la letra.

## Objetivo
Fondo paper de trading cripto con agentes IA, 100% web (GitHub + Vercel), sin depender de mi PC. Meta: +50€/día sobre 500€ con costes realistas (taker + spread). Paper siempre; real solo con mi activación explícita.

## Cómo trabajar (obligatorio)
1. **Spec primero**: todo cambio empieza en `specs/` (constitution → spec con criterios de aceptación medibles → plan → tasks). Sin spec aprobada, no hay código.
2. **Skills**: aplica `skills/to-spec` al especificar, `skills/systematic-debugging` ante cualquier bug (causa raíz antes de arreglar), y consulta al council (subagentes paralelos) para planificar y revisar.
3. **Implementa por tasks** marcando `[x]` solo con evidencia de ejecución.
4. **Testea y debuguea** hasta verde: `tsc:0`, build OK, endpoints/health OK, tests en verde. Si 3 fixes fallan, se cuestiona la arquitectura, no se prueba un cuarto fix.
5. **Documenta cada cambio** en `CHANGELOG.md` y crea **checkpoint** (`git tag checkpoint/<fase>` + push de tags).
6. **Pushea sin preguntar** al terminar cada cambio (código + tags).
7. **Honestidad técnica**: cuotas gratis como restricción de diseño; prohibido el demo silencioso; si algo exige cuenta/registro nuevo, proponerlo explícitamente en vez de asumirlo.

## Reglas del fondo
Thresholds y economía viven en código versionado (`risk.js`, `target.js`, `costs.js`). Sin stops por pérdidas (decisión vigente): solo topes de exposición/apalancamiento/concentración + kill manual.
