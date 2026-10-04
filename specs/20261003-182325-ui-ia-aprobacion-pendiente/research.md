# Research: UI de IA y corrección de esperando_aprobacion en la base

## Decisión 1: migración aditiva pura, sin tocar las transiciones existentes

**Decision**: se agrega `esperando_aprobacion` al `check` de `ia_interacciones.estado` y dos ramas nuevas a la tabla de transiciones de `registrar_evento_interaccion_ia` (`respuesta_validada → esperando_aprobacion`, `esperando_aprobacion → completada/rechazada/cancelada`); ninguna rama existente se modifica.

**Rationale**: el patrón ya está establecido por `revision_humana`, que entra y sale desde los mismos dos puntos (`respuesta_validada` como origen, `completada`/`rechazada`/`cancelada` como destino de resolución). `esperando_aprobacion` es simétrico y completamente equivalente (FR-002, Historia de Usuario 3): mismo origen, mismo conjunto completo de resoluciones, porque `AccionesResolucionInteraccionIA` (Decisión en la Historia de Usuario 3) ofrece las mismas tres acciones para ambos estados — si la base no aceptara `cancelada` desde `esperando_aprobacion`, el botón "Cancelar" fallaría en ese caso mientras funciona en `revision_humana`.

**Alternatives considered**: dejar fuera `esperando_aprobacion → cancelada` (versión descartada de este documento) — se revirtió: contradecía FR-002 y la Historia de Usuario 3 ("ambos ofrecen las mismas tres opciones"), y habría dejado un botón visible que la base rechaza.

## Decisión 2: `resolver_revision_ia` no cambia

**Decision**: cero cambios a la función `resolver_revision_ia`.

**Rationale**: ya es completamente genérica respecto del estado de origen — solo valida que `p_estado_final` esté en `('completada','rechazada','cancelada')` y delega la validez real de la transición a `registrar_evento_interaccion_ia`. Una vez que esa función conoce `esperando_aprobacion` como origen válido, `resolver_revision_ia` la resuelve sin saber que existe un estado nuevo.

**Alternatives considered**: ninguna — cambiarla sería tocar código que ya funciona correctamente para resolver un problema que no tiene.

## Decisión 3: componentes de UI viven junto a `EstadosPagina`, no dentro de `pages/ia/`

**Decision**: la insignia de estado y las acciones de resolución se crean en `apps/web/src/components/ia/` (nuevo subdirectorio, mismo nivel que `components/estados/`), no dentro de `pages/ia/interacciones.tsx`.

**Rationale**: el ítem #20 del roadmap pide explícitamente "piezas visuales reutilizables" — si vivieran dentro de la página que las usa primero, cualquier pantalla futura (el chat IA que ya se está planeando, un panel de aprobaciones) tendría que importar cruzado desde `pages/`, rompiendo la convención ya establecida de `components/` para lo compartido entre pantallas.

**Alternatives considered**: extenderlas directamente dentro de `components/estados/EstadosPagina.tsx` — rechazado: esos componentes son genéricos de cualquier pantalla (carga/vacío/error/éxito sin conocer "interacción de IA"); la insignia de estado sí conoce el dominio de IA (mapea `EstadoInteraccion` específicamente), así que merece su propio archivo, aunque reutilice los mismos colores/criterios de severidad que `EstadosPagina` ya usa.

## Decisión 4: la insignia distingue 4 categorías visuales, no 10 colores distintos

**Decision**: los 10 valores de `EstadoInteraccion` se agrupan en 4 categorías de presentación: en curso (progreso), éxito (`completada`), necesita acción humana (`esperando_aprobacion`, `revision_humana`), y terminal sin éxito (`rechazada`, `fallida_tecnica`, `cancelada`).

**Rationale**: diez colores distintos no comunican nada que cuatro categorías no comuniquen mejor — es la misma lógica que ya usa `EstadosPagina` (`info`/`success`/`error`, tres categorías para toda la plataforma). Separar "necesita acción humana" como su propia categoría (ni éxito ni error) es la pieza nueva real que esta spec aporta, porque antes de `esperando_aprobacion` solo existía `revision_humana` en esa categoría y la pantalla actual no la trataba como una categoría propia (la mostraba igual que cualquier otro texto de estado).

**Alternatives considered**: un color por estado (10 colores) — rechazado, sin valor de comunicación adicional y dificulta el mantenimiento cuando se agregue un estado nuevo en el futuro (habría que decidir un color nuevo cada vez en vez de encajarlo en una de las 4 categorías ya existentes).
