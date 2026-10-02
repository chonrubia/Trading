# Constitución — AI Trading Floor

Principios no negociables. Todo cambio debe respetarlos o proponer enmendarlos aquí primero.

1. **Paper primero**: nada opera con dinero real sin activación humana explícita y salvaguardas verificadas.
2. **Métricas honestas**: todo PnL mostrado es neto de comisiones + slippage + spread modelados. Prohibido el modo demo silencioso (toda simulación va etiquetada).
3. **Verificación por ejecución**: ninguna tarea se da por hecha sin ejecutar (tests, build, endpoints). `tsc:0 + build:0 + health:ok` es el mínimo.
4. **Spec-driven**: ningún código sin spec aprobada (specs/spec-*.md), ningún spec sin criterios de aceptación medibles.
5. **Trazabilidad total**: cada cambio en CHANGELOG.md, cada fase en un checkpoint (tag `checkpoint/<fase>`), cada push a `main` deja Vercel redesplegado.
6. **Cuotas gratis como restricción de diseño**: GitHub Actions ≤1500 min/mes, Vercel Hobby y KV dentro de free-tier. La arquitectura se adapta a la cuota, no al revés.
7. **Un solo motor a la vez**: idempotencia por slot e locks; prohibido el doble gasto (dos motores operando el mismo fondo).
