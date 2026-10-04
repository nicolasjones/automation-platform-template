# Data Model: Fallback de navegación asistido por IA

No hay tablas de Supabase ni persistencia propia (ver `research.md`, Decisión 3). Las entidades de esta capacidad son tipos de TypeScript declarados por el consumidor o devueltos por el mecanismo; viven en memoria durante una sola invocación.

## PasoRecuperable

Declaración del consumidor que describe un bloqueo que puede delegarse al mecanismo.

| Campo | Tipo | Notas |
|---|---|---|
| `alcance` | `{ dominioPermitido: string }` | Dominio exacto al que puede pertenecer cualquier elemento objetivo de una acción. El mecanismo rechaza cualquier acción que referencie un objetivo fuera de este dominio (FR-004). |
| `accionesPermitidas` | `AccionPermitida[]` | Vocabulario cerrado para este paso (ver abajo). Nunca vacío cuando se invoca el mecanismo (si está vacío, el consumidor no debería invocar — Edge Case). |
| `verificador` | `Verificador` | Función del consumidor que confirma el resultado. |
| `checkpoint` | `CheckpointReanudacion` | Punto idempotente para reanudar tras éxito. |
| `contexto` | `Record<string, unknown>` | Datos que describen el bloqueo para la IA; se sanitiza con `sanitizarDato` del contrato del consumidor antes de salir hacia el proveedor. |

## AccionPermitida

Unión discriminada cerrada (ver `research.md`, Decisión 4). Cada variante referencia un elemento ya localizado por el consumidor (nunca un selector CSS/XPath libre que la IA inventa), para que la superficie de ataque sea "elegir entre N elementos ya recortados por el consumidor", no "navegar libremente".

| Variante | Campos propios | Uso típico |
|---|---|---|
| `completar_campo` | `objetivo: string` (clave declarada por el consumidor, no selector), `valorPermitido?: string[]` | Completar un campo cuyo valor debe venir de un conjunto acotado o quedar vacío. |
| `click_en_elemento` | `objetivo: string` | Confirmar/cerrar un elemento ya localizado (botón, popup). |
| `esperar_elemento` | `objetivo: string`, `timeoutMs: number` | Esperar a que algo ya anticipado por el consumidor aparezca. |
| `confirmar_descarga` | `objetivo: string` | Confirmar una descarga u operación ya en curso que el propio camino determinista inició. |

`objetivo` es siempre una clave simbólica que el **consumidor** resuelve a un `Locator` real de Playwright — la IA nunca recibe ni produce selectores; elige entre claves que el consumidor ya declaró y mapeó.

## AccionPropuesta

Lo que la IA propone y lo que el mecanismo ejecuta — mismo vocabulario que `AccionPermitida`, pero `completar_campo` lleva el valor concreto elegido (`valor: string`) en vez del permiso (`valorPermitido?: string[]`). El mecanismo valida que `tipo`+`objetivo` coincidan con una `AccionPermitida` declarada y, para `completar_campo`, que `valor` esté en `valorPermitido` cuando el consumidor lo restringió; solo entonces construye la `AccionPropuesta` que se ejecuta — nunca reenvía el objeto crudo que devolvió el proveedor.

## Verificador

```ts
type Verificador = (contextoPosterior: unknown) => Promise<boolean>
```

Determinista desde la perspectiva del mecanismo: el mecanismo no reintenta si lanza o si devuelve `false` (FR-005). El consumidor decide internamente cómo verificar (polling acotado, chequeo de estado del DOM, etc.); eso es responsabilidad suya, no de esta capacidad.

## CheckpointReanudacion

```ts
type CheckpointReanudacion = {
  idempotencyKey: string
}
```

Opaco para el mecanismo: solo se devuelve intacto al consumidor junto con el resultado de la invocación. La lógica de "qué significa reanudar desde aquí sin duplicar" es exclusiva del consumidor (FR-006) — esta capacidad no sabe qué es una descarga ni una fila de datos.

## ResultadoInvocacion

Lo que el mecanismo devuelve al consumidor al terminar.

| Campo | Tipo | Notas |
|---|---|---|
| `estado` | `'recuperado' \| 'no_recuperable'` | Nunca un tercer estado "parcial": o se verificó éxito, o se detuvo. |
| `motivo` | `string \| null` | Presente cuando `estado === 'no_recuperable'`: `'sin_acciones_permitidas'` (el consumidor declaró el paso sin vocabulario — nunca se invoca al proveedor) \| `'accion_no_declarada'` (la IA propuso algo fuera del vocabulario o un valor de `completar_campo` fuera de `valorPermitido`) \| `'dominio_no_autorizado'` \| `'verificador_rechazado'` \| `'sin_politica_activa'` \| `'presupuesto_agotado'` \| `'error_tecnico'`. `'sin_acciones_permitidas'` y `'accion_no_declarada'` son motivos distintos a propósito: el primero nunca llega a invocar al proveedor, el segundo sí lo invocó y rechazó su respuesta. |
| `checkpoint` | `CheckpointReanudacion \| null` | Eco del checkpoint declarado, presente solo cuando `estado === 'recuperado'`. |
| `interaccionId` | `string` | `crypto.randomUUID()` generado por esta capa al iniciar la invocación (`packages/ia`'s `InteraccionEnCurso` no expone un id propio); sirve para que el consumidor correlacione esta llamada con sus propios logs, no es un id que `packages/ia` reconozca por sí mismo. |

No hay transiciones de estado propias de esta capa: el estado de la interacción subyacente (`iniciada → preparando → invocando → respuesta_validada/rechazada/revision_humana → completada`) es integramente el de `packages/ia` (`interacciones.ts`); esta capa solo lo traduce a `ResultadoInvocacion` para el consumidor.
