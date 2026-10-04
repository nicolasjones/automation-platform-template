# Quickstart

## Base de datos

```sh
pnpm dev:supabase
pnpm test:db
```

pgTAP nuevo: dos interacciones fixture en `respuesta_validada` transicionan a `esperando_aprobacion`; una se resuelve a `completada` y la otra a `cancelada` (FR-002, simétrico a `revision_humana`) — todos los pasos deben tener éxito; las transiciones ya existentes (incluida `revision_humana`) siguen pasando sin cambios.

## Frontend

```sh
pnpm --filter @platform/web test
```

- `InsigniaEstadoInteraccionIA`: los 10 valores de `EstadoInteraccion` producen una de las 4 categorías visuales documentadas en `data-model.md`.
- `AccionesResolucionInteraccionIA`: se muestra para `revision_humana`/`esperando_aprobacion`, es `null` para cualquier otro estado.

## Validación manual (opcional)

`pnpm dev:refine` → `/ia/interacciones` como superadmin → confirmar que la pantalla sigue cargando, mostrando vacío si no hay interacciones, y resolviendo igual que antes.
