# systematic-debugging (obra/superpowers) — proceso vigente

Fuente: https://github.com/obra/superpowers (ver texto completo allí). Resumen operativo que se sigue al pie de la letra:

**Ley de hierro: NINGÚN FIX SIN INVESTIGAR LA CAUSA RAÍZ (Fase 1 completa).**

- **Fase 1 — Causa raíz**: leer errores enteros, reproducir de forma consistente, revisar cambios recientes (git), instrumentar fronteras entre componentes (qué entra/sale en cada capa) y trazar el flujo de datos hacia atrás hasta el origen.
- **Fase 2 — Patrones**: buscar ejemplos que sí funcionan, comparar con referencias leídas completas, listar diferencias.
- **Fase 3 — Hipótesis**: una sola hipótesis escrita, cambio mínimo, una variable cada vez.
- **Fase 4 — Implementación**: primero test que reproduzca el fallo, un solo cambio, verificar (incluido que nada más se rompe).
- **Regla del 3**: si 3 fixes fallan, se para y se cuestiona la arquitectura con el gestor. No hay cuarto intento sin esa conversación.
- **Banderas rojas** (volver a Fase 1): "arreglo rápido por ahora", "probar X a ver", varios cambios a la vez, saltarse el test, "una intentona más".
