# Research: validación real de esquemas de entrada/salida para IA

## Decisión 1: `ajv`, no un validador propio

**Decision**: se agrega `ajv` (MIT) como dependencia de `packages/ia`.

**Rationale**: se confirmó que no existe ninguna dependencia de validación de esquemas (`ajv`, `zod`, `joi`, `yup`) en todo el monorepo (`grep` sobre `pnpm-lock.yaml` y todos los `package.json`). JSON Schema es una especificación extensa (tipos, formatos, `$ref`, composición `allOf`/`anyOf`, etc.); reimplementarla a mano sería mucho más riesgoso que usar la librería de facto del ecosistema Node/TypeScript. Licencia MIT, compatible con la regla de este repo de evitar herramientas con licencias que restrinjan uso comercial.

**Alternatives considered**: `zod` — rechazado, es un validador de esquemas TypeScript-first con su propio DSL, no JSON Schema; los contratos ya se guardan como JSON Schema en `jsonb` (`ia_contratos_consumidor.esquema_entrada`/`esquema_salida`), cambiar de formato rompería esa persistencia ya mergeada.

## Decisión 2: ningún registro de "herramienta" nuevo — `ContratoConsumidor` ya es la función explícita

**Decision**: no se crea ninguna tabla, tipo o concepto de "herramienta"/"función" separado. Se valida directamente contra los campos `esquemaEntrada`/`esquemaSalida` que `ContratoConsumidor` ya tiene desde `016-capacidad-ia-gobernada`.

**Rationale**: el roadmap describe el ítem #15 como "funciones explícitas que el modelo puede usar, con schema de entrada, schema de salida, permisos y validación de entradas/salidas". Comparado campo por campo, `ContratoConsumidor` (`codigo`, `esquemaEntrada`, `esquemaSalida`, `datosPermitidos`) ya satisface esa forma — cada `consumidor_codigo` es, en los hechos, una función explícita con su propio esquema. Construir un concepto paralelo duplicaría lo que ya existe sin agregar valor; sería exactamente el tipo de "infraestructura sin caso de uso" que el Principio V de la constitución advierte evitar.

**Alternatives considered**: una tabla `ia_herramientas` separada de `ia_contratos_consumidor`, con su propia relación a políticas — rechazada, no hay ninguna diferencia funcional real entre "una herramienta" y "un contrato de consumidor" tal como ya está modelado.

## Decisión 3: validar `entrada` cruda contra `esquemaEntrada`, antes de sanitizar — mismo orden que el aislamiento de organización

**Decision**: la validación de esquema de entrada ocurre sobre `entrada` cruda, antes de `sanitizarDato`, dentro de `prepararInvocacion`.

**Rationale**: mismo razonamiento que `contexto-permisos-ia` (Decisión 4 de esa spec): el esquema describe la forma completa que el consumidor espera recibir; si se validara después de sanitizar, un campo fuera de `datosPermitidos` ya habría sido eliminado y nunca podría fallar la validación de esquema aunque el esquema lo exigiera — exactamente el caso donde más importa detectarlo.

**Alternatives considered**: validar sobre el resultado sanitizado — rechazada por el motivo anterior; además inconsistente con el orden ya establecido para el chequeo de organización.

## Decisión 4: `esquemaSalida` como parámetro opcional de `validarSalida`, default `{}`

**Decision**: `validarSalida(valor: unknown, esquemaSalida: object = {})`.

**Rationale**: el único test existente llama `validarSalida('respuesta')` con un solo argumento. Un segundo parámetro opcional con default preserva esa llamada sin cambios (igual patrón que el `contextoOrganizacion` opcional de `prepararInvocacion` en la spec anterior) y permite que un consumidor futuro pase un esquema real sin que el que no lo necesita (`ai-navigation-fallback`, que ni siquiera llama a esta función hoy) se vea afectado.

**Alternatives considered**: hacerlo obligatorio y actualizar el test existente — rechazada, rompe compatibilidad sin necesidad cuando un default resuelve lo mismo.
