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

## R6. `clave_ejecucion` sin FK

El dato que cada producto usa para disparar la ejecución real (en
`nicolasjones/estudio-contable-automation`, una clave de
`capacidades_ejecucion`) es un detalle de cada producto, no de este
template — por eso `clave_ejecucion` es texto suelto sin FK.
