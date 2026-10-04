# Research: aprobación humana antes de completar una interacción

## Decisión 1: mismo patrón que `revision_humana`, no un control de permisos nuevo

**Decision**: `packages/ia` modela el estado `esperando_aprobacion`, pero no decide ni verifica quién puede resolverlo.

**Rationale**: `revision_humana` (ya mergeada, `016-capacidad-ia-gobernada`) ya establece el precedente exacto: el estado existe en `packages/ia`, pero "visible y resoluble sólo por superadmin" lo decide la RLS de cada producto (`ia_interacciones` + RPC `resolver_revision_ia`), no la librería. Repetir ese patrón mantiene la separación de responsabilidades ya establecida: `packages/ia` es agnóstica de quién tiene permiso, cada producto lo decide con su propio modelo de roles.

**Alternatives considered**: agregar un parámetro `aprobadoPor`/rol requerido a `aprobarInteraccion` — rechazado, `packages/ia` no tiene noción de usuarios ni roles en ningún otro lugar (ni siquiera `revision_humana` lo tiene), sería inconsistente agregarlo solo acá.

## Decisión 2: `completarInteraccion` gana un parámetro opcional, no una función nueva

**Decision**: `completarInteraccion(interaccion, opciones?: { requiereAprobacionHumana?: boolean })` — con el parámetro ausente u omitido, se comporta exactamente igual que hoy.

**Rationale**: mismo criterio que `contexto-permisos-ia` y `herramientas-ia-esquemas`: extender la función que todo consumidor ya llama, con un parámetro opcional con default, en vez de bifurcar en dos funciones (`completarInteraccion`/`completarInteraccionConAprobacion`) que duplicarían la lógica de transición.

**Alternatives considered**: leer el flag directamente del `ContratoConsumidor` dentro de `completarInteraccion` — rechazado, `completarInteraccion` no recibe el contrato como parámetro hoy (solo recibe `interaccion`) y agregarlo ensancharía su firma más de lo necesario; el consumidor ya sabe si su propio contrato requiere aprobación, así que puede decidirlo él mismo al llamar.

## Decisión 3: sin tabla, columna ni RPC nueva

**Decision**: el estado vive solo en `InteraccionEnCurso` (en memoria), igual que el resto de la máquina de estados.

**Rationale**: mismo motivo que en `contexto-permisos-ia` (Decisión 1): no existe hoy ninguna función que inserte o actualice una fila real de `ia_interacciones` — construir la UI/RPC de aprobación sin esa persistencia real sería anticipar una pieza que todavía no tiene dónde vivir. Cuando exista un consumidor real con un efecto real que aprobar, esa adopción decide cómo conectar este estado a una tabla y una pantalla.

**Alternatives considered**: ninguna — ya se evaluó y rechazó la misma idea en la spec anterior por el mismo motivo real (verificado, no persistencia nunca construida).
