# Quickstart: validar la extensión de contexto/organización en `packages/ia`

## Prerrequisitos

```sh
pnpm install
pnpm --filter @platform/ia build
```

## Validar

```sh
pnpm --filter @platform/ia test
```

## Escenario 1 — organización coincide

1. Contrato con `claveAislamientoOrganizacion: 'organizacionId'`.
2. `entrada = { organizacionId: 'org-1', dato: 'x' }`, `contextoOrganizacion = { organizacionId: 'org-1' }`.
3. Esperado: `prepararInvocacion` devuelve el dato sanitizado con normalidad.

## Escenario 2 — organización no coincide, en cualquier nivel de anidamiento

1. Mismo contrato.
2. `entrada = { lista: [{ organizacionId: 'org-2' }] }`, `contextoOrganizacion = { organizacionId: 'org-1' }`.
3. Esperado: lanza `ORGANIZACION_IA_NO_AUTORIZADA` antes de sanitizar.

## Escenario 3 — sin clave de aislamiento declarada, compatibilidad total

1. Contrato sin `claveAislamientoOrganizacion` (como `ai-navigation-fallback` hoy).
2. Cualquier `entrada`, sin pasar `contextoOrganizacion`.
3. Esperado: comportamiento idéntico al de antes de esta entrega — ningún chequeo nuevo, ninguna excepción nueva.

## Fuera de alcance de este quickstart

No hay escenario de persistencia (no existe fila de `ia_interacciones` que crear todavía — ver `research.md`, Decisión 1).
