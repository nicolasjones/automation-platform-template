# Data Model: validación real de esquemas de entrada/salida para IA

Sin tablas ni tipos nuevos (ver `research.md`, Decisión 2). Se reutiliza `ContratoConsumidor` (`packages/ia/src/types.ts`), sin cambios de forma — `esquemaEntrada`/`esquemaSalida` ya existían, tipados como `object`, y ahora se interpretan de verdad como JSON Schema.

## Función nueva

```ts
function validarContraEsquema(valor: unknown, esquema: object, codigoError: string): void
```

Compila `esquema` con `ajv` y valida `valor`; lanza `new Error(codigoError)` si no cumple. Sin estado, sin caché entre llamadas (ver `research.md` si el rendimiento de recompilar el esquema en cada invocación llegara a importar — no hay evidencia hoy de que importe, y agregar caché sin medición sería optimización prematura).

## Funciones extendidas

- `prepararInvocacion` (`ejecutar.ts`): agrega una llamada a `validarContraEsquema(entrada, contrato.esquemaEntrada, 'ENTRADA_IA_FUERA_DE_ESQUEMA')`, sobre `entrada` cruda, antes de `sanitizarDato` (research.md, Decisión 3).
- `validarSalida` (`validarContrato.ts`): gana un segundo parámetro opcional `esquemaSalida: object = {}`; conserva su chequeo de "es un objeto, no un array" y agrega `validarContraEsquema(valor, esquemaSalida, 'RESPUESTA_IA_FUERA_DE_ESQUEMA')`.
