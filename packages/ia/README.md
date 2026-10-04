# `@platform/ia`

Biblioteca interna para consumidores de IA de la plataforma. Se ejecuta dentro
de cada aplicación o worker de dominio; no existe un worker central de IA.
La configuración, políticas y auditoría son globales en Supabase, pero el
consumidor conserva la responsabilidad de invocar su adaptador de proveedor.

## Antes de adoptar

1. Crear una spec del consumidor y declarar su contrato: esquema de entrada y
   salida, campos permitidos, presupuesto y tratamiento del resultado.
2. El superadmin registra el contrato y habilita una política global con un
   perfil principal y, opcionalmente, uno de fallback. Ambos perfiles pueden
   pertenecer al mismo proveedor o a proveedores distintos.
3. Aprovisionar la clave fuera de Refine y Kestra mediante
   `infra/ia/aprovisionar-proveedores.mjs`. La clave queda en Vault y sólo el
   runtime autorizado la recupera de manera efímera.
4. El consumidor valida política y presupuesto con `prepararInvocacion`,
   sanitiza antes de persistir o alertar y registra cada transición mediante
   las RPC de interacción.

No incluir claves, tokens, payloads sin sanitizar ni datos que el contrato
excluye en logs, eventos Kestra, respuestas HTTP o evidencia persistida.

## Flujo de una interacción

`iniciarInteraccion` crea el estado local. `iniciarInvocacion` consume un
intento; ante fallo técnico, timeout o respuesta inválida,
`registrarFallo` permite un único fallback dentro del presupuesto de la
política. Un incumplimiento de contrato o verificador se rechaza sin fallback.
Al agotarse los intentos, la interacción pasa a `revision_humana`, visible y
resoluble sólo por superadmin. Una respuesta correcta se cierra con
`completarInteraccion` — directo a `completada`, o a `esperando_aprobacion`
si se llama con `{ requiereAprobacionHumana: true }` (opt-in; sin ese
parámetro, el comportamiento es idéntico al de siempre). `aprobarInteraccion`
y `rechazarInteraccion` resuelven esa espera hacia `completada` o `rechazada`.
Igual que con `revision_humana`, `packages/ia` no decide quién puede
aprobar — esa autorización es de la RLS de cada producto.

Para evidencias, implementar el repositorio de `purgarEvidenciasVencidas` con
la API de Storage: primero eliminar el objeto privado y después confirmar la
limpieza en base. Nunca borrar `storage.objects` desde SQL.

## Aislamiento por organización

Un contrato puede declarar `claveAislamientoOrganizacion`: el nombre del campo
que, dentro de los datos de entrada, identifica a qué organización pertenece
un dato. `prepararInvocacion` recibe entonces un sexto parámetro opcional,
`contextoOrganizacion: { organizacionId }` — resuelto por el consumidor del
lado del servidor (p. ej. `private.organizacion_id()`), **nunca** desde los
datos de entrada ni desde el prompt — y rechaza la invocación si algún dato,
en cualquier nivel de anidamiento, referencia una organización distinta.
Sin esa clave declarada, el comportamiento es idéntico al de un consumidor
que no maneja datos organizacionales: ningún chequeo nuevo.

## Esquemas de entrada y salida

`esquemaEntrada` y `esquemaSalida` del contrato son JSON Schema real, validado
con `ajv`: `prepararInvocacion` rechaza los datos de entrada que no cumplen
`esquemaEntrada` antes de sanitizar o invocar al proveedor, y `validarSalida`
rechaza una respuesta que no cumple `esquemaSalida` (segundo parámetro
opcional, default `{}` — cualquier objeto). Un esquema `{}` no restringe
nada: un contrato que no necesita forma real de datos sigue funcionando sin
cambios.

## Costo estimado y evaluaciones

`calcularCostoEstimado` es aritmética pura sobre tokens usados y una tarifa
que el consumidor ya conoce (no hay catálogo de precios en la plataforma);
el resultado es responsabilidad del consumidor guardarlo, por ejemplo en el
`detalle` de un evento de interacción, que ya es un `Record<string, unknown>`
sin esquema fijo. `ejecutarCasosEvaluacion` corre una lista de casos
(entrada, salida esperada) contra la función ejecutora del propio consumidor
y reporta qué casos coinciden — útil para confirmar que un cambio de modelo
o de prompt no rompió comportamientos ya validados. Ninguna de las dos
funciones depende de ni modifica el resto de la capacidad.

## Límites de esta capacidad

La biblioteca no elige casos de negocio, no implementa navegación ni expone
un endpoint común. Cada producto o worker que la consuma define su propio
adaptador de ejecución y su contrato versionado. Kestra recibe únicamente el
evento sanitizado cuando una interacción requiere revisión.

## Configuración de claves

Las variables `IA_PROVEEDOR_CODIGO`, `IA_PROVEEDOR_CREDENCIAL` e
`IA_PROVEEDOR_CLAVE` se usan sólo durante el aprovisionamiento. Cargarlas desde
un archivo local ignorado o desde el gestor de secretos del despliegue; no son
variables de Refine, Kestra ni de los workers en ejecución. Ver `.env.example`
e `infra/ia/aprovisionar-proveedores.mjs`.
