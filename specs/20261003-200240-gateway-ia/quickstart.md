# Quickstart

```sh
pnpm --filter @platform/ia test
```

Escenarios nuevos (fetch inyectado, sin red real — mismo patrón que `descubrirModelos.test.ts`):

- `endpointInvocacion`: cada adaptador soportado (`openai`, `openai-compatible`, `anthropic`, `gemini`) produce la URL esperada; `baidu` lanza `PROVEEDOR_IA_SIN_ENDPOINT_INVOCACION`.
- `invocarProveedorIa`: por cada adaptador, el `fetch` inyectado recibe el método `POST`, la URL y los headers correctos (mismos casos que ya cubre `descubrirModelos.test.ts` para headers, más `gemini` con el modelo en el path).
- Respuesta no exitosa (`response.ok = false`): lanza `INVOCACION_PROVEEDOR_IA_FALLO_<status>`.
- Respuesta exitosa: devuelve `response.json()` sin transformar.

## Validación de regresión

- `pnpm test:ia` (incluye `packages/ia-navegacion`) — sin cambios esperados, esta spec es aditiva.
- `pnpm build` / `pnpm lint` en el monorepo.
