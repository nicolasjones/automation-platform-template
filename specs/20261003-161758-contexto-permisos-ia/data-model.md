# Data Model: Contexto y permisos de organización para IA

Sin tablas nuevas (ver `research.md`, Decisión 1). Un tipo nuevo y una extensión de un tipo existente, ambos en `packages/ia/src/types.ts`.

## ContextoOrganizacion (nuevo)

```ts
type ContextoOrganizacion = { organizacionId: string | null }
```

Declarado por el consumidor, resuelto del lado del servidor (p. ej. `private.organizacion_id()` u otra fuente RLS ya existente) — nunca construido a partir de los datos de entrada ni del prompt (FR-003).

## ContratoConsumidor (extendido)

Campo nuevo, opcional:

| Campo | Tipo | Notas |
|---|---|---|
| `claveAislamientoOrganizacion` | `string \| null` (opcional) | Nombre del campo que, dentro de los datos de entrada, identifica a qué organización pertenece un dato. `undefined`/`null`/ausente desactiva el chequeo por completo (FR-005) — compatible con todo contrato existente. |

Todos los campos existentes (`codigo`, `version`, `esquemaEntrada`, `esquemaSalida`, `datosPermitidos`, `limiteIntentos`, `limiteSegundos`) quedan sin cambios.

## Validación (sin entidad propia, es una función pura)

```ts
function validarAislamientoOrganizacion(
  entrada: unknown,
  claveAislamiento: string | null | undefined,
  contexto: ContextoOrganizacion,
): void
```

Lanza `ORGANIZACION_IA_NO_AUTORIZADA` si `claveAislamiento` está declarada y algún dato de entrada, en cualquier nivel de anidamiento, tiene esa clave con un valor distinto de `contexto.organizacionId`. No devuelve nada ni transforma `entrada` — es una guarda, no un filtro (eso ya lo hace `sanitizarDato`, después).
