# Contrato: componentes nuevos y migración

No hay RPC nueva — `resolver_revision_ia` queda sin cambios de firma (research.md, Decisión 2). El único contrato nuevo es el de los dos componentes de `apps/web/src/components/ia/`, documentados en `data-model.md`.

## Uso en `interacciones.tsx`

```tsx
<InsigniaEstadoInteraccionIA estado={interaccion.estado} />
<AccionesResolucionInteraccionIA interaccionId={interaccion.id} estado={interaccion.estado} onResuelto={cargar} />
```

Reemplaza el `Typography` inline del estado y el bloque `Stack` de botones condicionales que la pantalla ya tenía — mismo comportamiento visible, implementación compartida.
