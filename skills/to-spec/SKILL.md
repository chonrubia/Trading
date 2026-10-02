# to-spec (mattpocock/skills) — proceso vigente

Fuente: https://github.com/mattpocock/skills (skill `to-spec`). Resumen operativo:

1. Explorar el repo para entender el estado real del código; usar el vocabulario del dominio en toda la spec y respetar ADRs existentes.
2. Dibujar las **costuras (seams)** donde se va a testear: preferir las existentes y las más altas posibles; proponer nuevas solo si hace falta, y validarlas con el usuario.
3. Escribir la spec con: planteamiento del problema (voz del usuario), historias con criterios de aceptación, alcance y límites.
4. Publicar y etiquetar para el agente que implementa.

En este proyecto las specs viven en `specs/spec-*.md` y las costuras se acuerdan en `specs/plan.md`.
