# `@platform/ia-navegacion`

Capa de orquestación sobre `@platform/ia` para que un worker de navegador
recupere un paso bloqueado proponiendo, vía IA, una acción dentro de un
vocabulario explícito que el propio consumidor declaró — verificándola
localmente antes de continuar. No agrega proveedores, claves, políticas,
auditoría ni persistencia propia: todo eso sigue viviendo en `@platform/ia`.

## Antes de adoptar

1. Adoptar primero `@platform/ia` para tu consumidor: contrato, política
   activa y claves ya configuradas (ver su propio README, sección "Antes de
   adoptar").
2. Declarar un `PasoRecuperable` por cada bloqueo que quieras delegar: su
   `alcance.dominioPermitido`, el vocabulario de `accionesPermitidas`, tu
   propio `verificador` determinista y un `checkpoint` idempotente.
3. Implementar un `AdaptadorInvocacionIa`: cómo llamar al proveedor
   (normalmente reexportando lo que ya usa tu adopción de `@platform/ia`),
   cómo resolver un `objetivo` simbólico a su dominio real (`resolverObjetivo`)
   y cómo ejecutar una acción sobre tu propia `Page`/`BrowserContext`
   (`ejecutarAccion`). La IA nunca recibe selectores ni código — solo elige
   entre las claves que ya declaraste.
4. Llamar `intentarRecuperarPaso(paso, politica, contratoConsumidor, adaptador)`
   únicamente cuando tu propio camino determinista ya falló en un paso que
   decidiste declarar recuperable. Esta capa nunca detecta bloqueos por sí
   misma.

## Flujo de una invocación

Se valida la política y el presupuesto de `@platform/ia`; si no hay política
activa o el presupuesto ya está agotado, la invocación termina de inmediato.
Un fallo técnico del proveedor (timeout, error, respuesta inválida) reintenta
una vez con el perfil de fallback de la política, si existe presupuesto para
ello — igual que cualquier otro consumidor de `@platform/ia`. Una acción fuera
del vocabulario declarado, un dominio no autorizado o un verificador que no
confirma éxito terminan la invocación de inmediato, **sin una segunda
propuesta** dentro de la misma llamada: `@platform/ia` ya trata un rechazo de
contrato o de verificador como terminal, sin fallback.

Solo una recuperación verificada devuelve el `checkpoint` que el consumidor
declaró; cualquier otro resultado lo devuelve en `null` junto con un `motivo`
explícito para que el consumidor use su propio manejo de error y la revisión
humana que ya provee `@platform/ia`.

## Límites de esta capacidad

No conoce ningún sistema externo, dominio de negocio ni producto concreto.
No gestiona sesiones ni concurrencia de navegador — opera siempre dentro de la
`Page`/`BrowserContext` que el consumidor ya autenticó y le pasa a través de su
`AdaptadorInvocacionIa`. La adopción real para un sistema externo concreto
(qué pasos son recuperables, qué acciones y verificadores tiene sentido
declarar) requiere su propia spec de producto, fuera de este paquete.
