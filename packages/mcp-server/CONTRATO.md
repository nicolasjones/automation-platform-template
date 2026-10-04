# Contrato operativo del servidor MCP

Mismo criterio que `workers/CONTRATO.md`, adaptado a un servicio HTTP de
larga vida (no un proceso puntual por ejecución).

## Entrada y salida

Escucha HTTP en `MCP_SERVER_PORT` (default 8787), sobre `node:http` nativo
(sin Express — ver research.md R8, incompatibilidad real encontrada con el
puente Hono del SDK), rutas `POST /mcp` y `DELETE /mcp` (protocolo
Streamable HTTP, modo **con sesión**: `sessionIdGenerator` genera un
`mcp-session-id` que el cliente reusa en solicitudes siguientes — no un
server nuevo por solicitud, research.md R4/R8). La credencial en
`Authorization: Bearer <token>` solo se valida en la solicitud que abre la
sesión (el `initialize`); las solicitudes siguientes de esa misma sesión
reusan las herramientas ya registradas para esa conexión.

Variables de entorno requeridas: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
El servidor en sí **no invoca ningún proveedor de IA** — solo expone datos y
acciones como herramientas MCP; quien genera texto o decide qué invocar es
el cliente externo (Claude Desktop u otro), no este proceso. Por eso no
necesita (ni debe esperar) una política/contrato de `packages/ia` aprobado
para funcionar — eso solo aplicaría si alguna herramienta futura generara
contenido con un modelo, que hoy ninguna hace.

## Autenticación

Una credencial inválida o revocada responde `403` antes de listar ninguna
herramienta. Toda lectura de datos de negocio pasa exclusivamente por
`private.mcp_leer_fila` (SQL, `security definer`) — el filtro de
organización vive ahí, no en este código (research.md R6).

## Despliegue

Contenedor propio: `infra/mcp-server/Dockerfile` + `infra/mcp-server/compose.yaml`
(`pnpm dev:mcp-server` / `pnpm dev:down:mcp-server`), mismo patrón que
`infra/refine` — sin Compose raíz (Principio IV), ciclo de despliegue
independiente del resto de la plataforma. `MCP_SERVER_PORT` (default 8787)
y `SUPABASE_SERVICE_ROLE_KEY` se configuran en `.env` (nunca versionado) —
ver `.env.example`.
