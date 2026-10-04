# Contrato: `invocarProveedorIa`

No hay RPC ni endpoint HTTP propio — es una función de `@platform/ia`, consumida por código TypeScript (workers, futuros consumidores de chat/RAG/MCP).

## Firma

```ts
invocarProveedorIa(perfil: PerfilModelo, clave: string, cuerpo: unknown, fetchInvocacion: FetchInvocacion): Promise<unknown>
```

## Contrato de comportamiento

- Entrada: `perfil` ya resuelto por el consumidor (no resuelve política ni presupuesto — eso es responsabilidad de `prepararInvocacion`, sin cambios); `clave` ya resuelta vía `obtener_clave_perfil_ia` (sin cambios); `cuerpo` con la forma exacta que el proveedor espera (el consumidor la arma).
- Salida exitosa: el `json()` crudo de la respuesta del proveedor, sin interpretar.
- Salida con error: lanza `Error('INVOCACION_PROVEEDOR_IA_FALLO_<status>')` si `!response.ok`; lanza `Error('PROVEEDOR_IA_SIN_ENDPOINT_INVOCACION')` si el adaptador no tiene endpoint de invocación soportado (hoy solo `baidu`).
- No valida `cuerpo` contra ningún esquema — `prepararInvocacion` ya validó la entrada del consumidor contra `esquemaEntrada` antes de este punto; esta función no sabe nada del contrato de negocio.

## Uso esperado por un consumidor futuro

```ts
const entrada = prepararInvocacion(contrato, politica, entradaCruda, intentos, iniciadoEn)
const cuerpoProveedor = armarCuerpoParaMiCaso(entrada) // responsabilidad del consumidor
const respuesta = await invocarProveedorIa(perfil, clave, cuerpoProveedor, fetch)
const resultado = interpretarRespuesta(respuesta) // responsabilidad del consumidor
```
