# Contrato: validación de esquemas en `prepararInvocacion` y `validarSalida`

## `prepararInvocacion` (orden final de validaciones)

1. `validarPoliticaActiva(politica)`
2. `validarPresupuesto(intentos, ...)`
3. **Nuevo**: `validarContraEsquema(entrada, contrato.esquemaEntrada, 'ENTRADA_IA_FUERA_DE_ESQUEMA')` — sobre `entrada` cruda.
4. `validarAislamientoOrganizacion(entrada, contrato.claveAislamientoOrganizacion, contextoOrganizacion)` (de `contexto-permisos-ia`, ya mergeada) — también sobre `entrada` cruda.
5. `sanitizarDato(entrada, contrato.datosPermitidos)`

Si el paso 3 o el 4 lanzan, nunca se llega a sanitizar ni a invocar al proveedor.

## `validarSalida`

```ts
function validarSalida(valor: unknown, esquemaSalida?: object): asserts valor is Record<string, unknown>
```

- Sin `esquemaSalida`: default `{}` — solo valida que sea un objeto no-array (comportamiento idéntico al actual).
- Con `esquemaSalida`: además exige que `valor` cumpla ese esquema JSON.

Quien llama (el consumidor, después de recibir la respuesta cruda del proveedor) decide si pasa el esquema de su contrato o no — esta función no cambia cuándo se invoca, solo qué valida cuando se le pasa un esquema real.
