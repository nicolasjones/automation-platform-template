# Data Model: Invocación real de proveedor en la capacidad de IA gobernada

Sin entidad de datos nueva — ninguna tabla, ninguna migración. Solo tipos y funciones en `packages/ia/src/proveedores/`.

## Catálogo (`catalogo.ts`)

```ts
export function endpointInvocacion(proveedor: ProveedorCatalogo, modeloId: string): string
```

Recibe el `ProveedorCatalogo` completo, no solo el `adaptador`: dentro de `openai-compatible` conviven proveedores con hosts distintos (x.ai, DeepSeek, Alibaba, Zhipu, Moonshot) — el adaptador decide el *patrón* de URL, pero el host sale de `proveedor.endpointModelos`, no de una constante por adaptador.

Deriva la URL real de inferencia a partir de `endpointModelos` del proveedor (mismo host base) y el patrón de cada adaptador (research.md, Decisión 1):

| Adaptador | Patrón |
|---|---|
| `openai`, `openai-compatible` | `<base sin /models>/chat/completions` |
| `anthropic` | `<base sin /models>/messages` |
| `gemini` | `<base>/models/<modeloId>:generateContent` |
| `baidu` | lanza `PROVEEDOR_IA_SIN_ENDPOINT_INVOCACION` (fuera de alcance, research.md Decisión 1) |

## Invocación (`index.ts`, junto a `descubrirModelos`)

```ts
export type FetchInvocacion = (url: string, init: { method: 'POST'; headers: Record<string, string>; body: string }) => Promise<RespuestaHttp>

export async function invocarProveedorIa(
  perfil: PerfilModelo,
  clave: string,
  cuerpo: unknown,
  fetchInvocacion: FetchInvocacion,
): Promise<unknown>
```

Resuelve el proveedor del catálogo vía `proveedorDelCatalogo(perfil.proveedorCodigo)`, arma headers vía la misma `encabezados(adaptador, clave)` que ya usa `descubrirModelos` (research.md, Decisión 3), arma la URL vía `endpointInvocacion`, hace `POST` con `cuerpo` serializado tal cual (research.md, Decisión 2). Si `response.ok` es falso, lanza `Error('INVOCACION_PROVEEDOR_IA_FALLO_<status>')` (mismo patrón que `DESCUBRIMIENTO_MODELOS_IA_FALLO_<status>`). Si es exitosa, devuelve `await response.json()` sin interpretarlo — el consumidor decide la forma.
