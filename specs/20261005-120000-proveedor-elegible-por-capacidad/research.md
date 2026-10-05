# Research: Proveedor elegible por capacidad

## R1. Por qué este mecanismo es de plataforma, no de producto

Lo genérico: catálogo `(capacidad, proveedor)`, elección por organización,
excepción por cliente, auditoría, función de resolución, y la validación
"el proveedor requiere una conexión activa a tal sistema externo" (usa
`conexiones` y `sistemas_externos`, ambas de este template). Ninguna fila
de catálogo real vive acá — eso es decisión de negocio de cada producto
derivado (ver spec.md, Origen y adopción).

## R2. Granularidad: organización con excepción por cliente

Solo por organización no alcanza cuando conviven clientes con proveedores
distintos dentro de la misma organización. Solo por cliente obliga a
configurar uno por uno. Con ambas, migrar de un proveedor a otro es: fijar
el default de la organización y quitar excepciones cliente por cliente a
medida que se valida cada uno.

## R3. Sin fallback automático

Si el proveedor elegido no está disponible (conexión faltante o inválida),
no se sustituye por otro: cambiar de proveedor sin una decisión explícita
podría exponer datos a un proveedor no querido, ocultar que el elegido
está caído, o producir escrituras duplicadas de dos proveedores a la vez.
La función de resolución informa el motivo; el consumidor decide.

## R4. Retiro de un proveedor del catálogo

Es la única sustitución automática que sí ocurre, y es intencional: un
proveedor retirado del catálogo (columna `activo = false`) ya no es una
opción válida para nadie. Un trigger (`private.retirar_elecciones_proveedor_capacidad`)
borra las elecciones/excepciones que lo usaban y audita el evento con
`actor = null` (decisión del producto, no de un administrador) — después
de eso, la resolución cae sola al siguiente nivel (la función de
resolución ya filtra por catálogo activo, así que ambos mecanismos son
redundantes a propósito: el trigger limpia y audita, la función de
resolución nunca depende de que el trigger haya corrido).

## R5. Dónde viven las tablas

En `public`, mismo criterio que `conexiones`/`sistemas_externos` (mecanismo
de plataforma, no un dato de dominio de un producto). `capacidad` y
`proveedor` son `text` (slugs libres, sin catálogo cerrado de capacidades:
cada producto define las suyas). `proveedor` es FK a `sistemas_externos.id`
para que "requiere conexión" sea una FK natural contra el mismo catálogo.

## R6. Aislamiento del gate de `workers_orquestacion` (hallazgo de authz-security)

`private.resolver_proveedor_capacidad` recibe `p_organizacion_id` como
parámetro. `workers_orquestacion` es un rol de GRUPO (todo `worker_<organizacion_id>`
es miembro) — un `GRANT` a ese grupo por sí solo no distingue de qué
organización es cada conexión real. Sin una validación interna, el worker
de una organización podría pasar el `p_organizacion_id` de otra y leer su
resolución (viola FR-009). Fix: el núcleo sin chequeo de identidad vive en
`private.resolver_proveedor_capacidad_interno` (sin GRANT propio, solo
invocado internamente por funciones que ya validaron su parámetro por otro
camino); `private.resolver_proveedor_capacidad` es un wrapper delgado que
exige, para `session_user like 'worker\_%'`, que coincida con
`private.organizacion_del_rol_actual()` (mismo patrón que
`private.autorizar_llamante_ciclo`, spec 016) antes de delegar. `session_user`
no cambia con `SECURITY DEFINER`, así que el chequeo no podía vivir en el
núcleo sin romper las dos funciones públicas (`proveedores_capacidad_de_organizacion`,
`proveedores_efectivos_de_cliente`), alcanzables por `authenticated` vía
PostgREST (`session_user = 'authenticator'` en producción, nunca
`kestra_orquestacion` ni `worker_*`).

## R7. `clave_ejecucion` sin FK

El dato que cada producto usa para disparar la ejecución real (en
`nicolasjones/estudio-contable-automation`, una clave de
`capacidades_ejecucion`) es un detalle de cada producto, no de este
template — por eso `clave_ejecucion` es texto suelto sin FK.
