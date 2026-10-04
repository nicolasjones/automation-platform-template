# Contrato extendido de `prepararInvocacion`

```ts
function prepararInvocacion(
  contrato: ContratoConsumidor,            // gana claveAislamientoOrganizacion?: string | null
  politica: PoliticaActiva,
  entrada: unknown,
  intentos: number,
  iniciadoEn: Date,
  contextoOrganizacion?: ContextoOrganizacion,  // nuevo, opcional, default { organizacionId: null }
): Record<string, unknown>
```

## Compatibilidad

Un consumidor existente que llama con los cinco parámetros originales sigue compilando y comportándose exactamente igual: sin `contextoOrganizacion`, el default es `{ organizacionId: null }`, y sin `claveAislamientoOrganizacion` en su contrato, `validarAislamientoOrganizacion` no hace nada (retorna de inmediato).

## Orden de validación dentro de la función

1. `validarPoliticaActiva(politica)` — sin cambios.
2. `validarPresupuesto(intentos, ...)` — sin cambios.
3. **Nuevo**: `validarAislamientoOrganizacion(entrada, contrato.claveAislamientoOrganizacion, contextoOrganizacion ?? { organizacionId: null })` — sobre `entrada` cruda, antes de sanitizar (`research.md`, Decisión 4).
4. `sanitizarDato(entrada, contrato.datosPermitidos)` — sin cambios.

Si el paso 3 lanza, los pasos 4 y la invocación al proveedor nunca ocurren.
