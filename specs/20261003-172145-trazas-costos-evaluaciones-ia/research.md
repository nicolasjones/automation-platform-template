# Research: costo estimado y arnés de evaluación para IA

## Decisión 1: sin tabla de tarifas ni de resultados de evaluación

**Decision**: ninguna de las dos funciones nuevas persiste nada. `calcularCostoEstimado` es aritmética pura; `ejecutarCasosEvaluacion` devuelve un arreglo en memoria.

**Rationale**: se verificó `ia_modelos_descubiertos` e `ia_perfiles_modelo` (migraciones de `016-capacidad-ia-gobernada`) — ningún campo de precio. No existe ninguna fuente de tarifas en la plataforma hoy; inventar una (catálogo de precios por proveedor, actualizado cómo y por quién) sin un consumidor real que la necesite sería exactamente la infraestructura especulativa que el Principio V de la constitución pide evitar. El costo calculado es responsabilidad del consumidor guardarlo donde le sirva — `EventoInteraccion.detalle` (`interacciones.ts`) ya es un `Record<string, unknown>` sin esquema fijo, así que ya existe un lugar para hacerlo sin que esta entrega lo toque.

**Alternatives considered**: agregar `costo_por_mil_tokens_entrada`/`salida` a `ia_perfiles_modelo` — rechazado, nadie lo completaría todavía (no hay UI que lo pida, no hay proceso que lo descubra automáticamente); quedaría como `esquemaEntrada`/`esquemaSalida` antes de esta ronda de specs: un campo declarado y nunca usado. Mejor no crearlo hasta que un consumidor real necesite guardar tarifas de verdad.

## Decisión 2: comparación por igualdad estructural simple (serialización), no una librería de deep-equal

**Decision**: el comparador por defecto de `ejecutarCasosEvaluacion` compara `JSON.stringify(esperado) === JSON.stringify(obtenido)`.

**Rationale**: todos los datos que atraviesan `packages/ia` ya son JSON-compatibles (esquemas JSON Schema, contratos, resultados sanitizados) — no hay `Map`, `Set`, `Date` ni referencias circulares en este dominio. Agregar una dependencia de deep-equal para un caso que la serialización ya resuelve sería una dependencia de más; `ajv` ya se agregó en la spec anterior para un problema que sí la necesitaba (interpretar JSON Schema), que es distinto de comparar dos valores JSON por igualdad.

**Alternatives considered**: `fast-deep-equal` (ya es dependencia transitiva de `ajv`, así que no costaría una instalación nueva) — se dejó como posible mejora futura si la serialización probara ser insuficiente (por ejemplo, por orden de claves no determinista); no hay evidencia hoy de que haga falta, y FR-003 ya cubre el caso real: un consumidor con una noción más rica de "igual" pasa su propio comparador.

## Decisión 3: una excepción en un caso no interrumpe el arnés

**Decision**: `ejecutarCasosEvaluacion` envuelve cada ejecución en su propio `try/catch`; una excepción marca ese caso como rechazado y el arnés sigue con el resto.

**Rationale**: el propósito del arnés es detectar regresiones en un conjunto de casos; un solo caso roto no debería impedir ver el resultado de los demás. Coherente con el patrón ya establecido en `ai-navigation-fallback` (un fallo de verificador se trata como resultado, no como excepción que aborta todo).

**Alternatives considered**: dejar que la excepción se propague y aborte el arnés completo — rechazado, pierde información sobre los demás casos sin necesidad.
