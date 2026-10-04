// Contrato: specs/servidor-mcp-generico/contracts/protocolo-mcp.md
//
// Listado dinámico de herramientas MCP por conexión: solo las funcionalidades
// habilitadas para la organización de la credencial Y expuestas a nivel
// plataforma aparecen como herramienta — nunca una lista completa con
// algunas marcadas como no disponibles (edge case de la spec).
//
// Decisión de seguridad reforzada (hallazgo del coordinador, 2026-10-03):
// no hay un "usuario logueado" ni JWT de sesión para una credencial MCP
// (a diferencia de Chat IA, que usa asUser + RLS) — el servidor corre con
// service_role. Un `.eq('organizacion_id', ...)` armado en TypeScript NO es
// una garantía real: alcanza con que una lectura nueva se agregue sin ese
// filtro para cruzar datos entre organizaciones, sin que la base lo
// detecte. Por eso toda lectura de datos de negocio pasa exclusivamente
// por `private.mcp_leer_fila` (SQL, security definer) — el WHERE de
// organización se arma DENTRO de esa función, no acá. Esta función de
// herramientas.ts no debe volver a tocar una tabla de negocio directo
// (`.from(vista)...`) nunca más.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { sanitizarDato } from '@platform/ia'
import type { ConexionAutenticada } from './autenticacion.js'

// sanitizarDato filtra por allowlist exacta (includes(), no glob) — acá la
// vista ya es una fuente curada y registrada a mano por un superadmin
// (fuentes_mcp), así que el allowlist real es "todas las columnas que la
// fila efectivamente tiene"; lo que sanitizarDato sigue aportando es el
// filtro de nombres con pinta de secreto (password/token/cookie/...) sobre
// esas columnas, que si no se usara acá quedaría sin aplicar.
function permitidosDesdeFilas(filas: unknown[]): string[] {
  const primera = filas[0]
  return primera && typeof primera === 'object' ? Object.keys(primera) : []
}

export async function registrarHerramientas(server: McpServer, conexion: ConexionAutenticada): Promise<void> {
  const { admin, organizacionId } = conexion

  const { data: fuentes } = await admin.from('fuentes_mcp').select('feature_id, vista, descripcion')
  for (const fuente of fuentes ?? []) {
    const { data: puedeLeer } = await admin.rpc('puede_mcp_leer_funcionalidad', { p_feature_id: fuente.feature_id, p_organizacion_id: organizacionId })
    if (!puedeLeer) continue

    server.registerTool(
      `leer_${fuente.feature_id}`,
      {
        title: fuente.descripcion ?? `Leer ${fuente.feature_id}`,
        description: fuente.descripcion ?? `Lee datos de ${fuente.feature_id}.`,
        inputSchema: { filtros: z.record(z.string(), z.union([z.string(), z.number()])).optional() },
      },
      async ({ filtros }) => {
        // Única vía de lectura de datos de negocio: el WHERE de
        // organización se arma dentro de private.mcp_leer_fila (SQL), no
        // acá. filtros viaja tal cual al campo jsonb p_filtros — la función
        // los agrega con format(%I)/format(%L), nunca concatenación directa.
        const { data, error } = await admin.rpc('mcp_leer_fila', {
          p_organizacion_id: organizacionId,
          p_feature_id: fuente.feature_id,
          p_filtros: filtros ?? {},
        })
        if (error) return { content: [{ type: 'text', text: 'ERROR_AL_LEER' }], isError: true }
        const filas = (data ?? []) as unknown[]
        return { content: [{ type: 'text', text: JSON.stringify(sanitizarDato(filas, permitidosDesdeFilas(filas))) }] }
      },
    )
  }

  const { credencialId } = conexion

  const { data: acciones } = await admin.from('acciones_mcp').select('feature_id, rpc, descripcion')
  for (const accion of acciones ?? []) {
    const { data: puedeEjecutar } = await admin.rpc('puede_mcp_ejecutar_funcionalidad', { p_feature_id: accion.feature_id, p_organizacion_id: organizacionId })
    if (!puedeEjecutar) continue

    server.registerTool(
      `ejecutar_${accion.feature_id}`,
      {
        title: accion.descripcion ?? `Ejecutar ${accion.feature_id}`,
        description: accion.descripcion ?? `Ejecuta una acción sobre ${accion.feature_id}.`,
        inputSchema: { parametros: z.record(z.string(), z.unknown()).optional() },
      },
      async ({ parametros }) => {
        // Dos pasos, no uno: iniciar_ejecucion_mcp revalida la capacidad y
        // pone el candado de concurrencia (TOCTOU, FR-013/FR-014); recién
        // después se invoca la RPC real de la funcionalidad, con su propia
        // firma tipada — supabase-js resuelve los parámetros nombrados
        // contra esa firma, igual que PostgREST (research.md R4, no hay
        // forma genérica de invocar una firma arbitraria por SQL dinámico).
        const { data: ejecucionId, error: inicioError } = await admin.rpc('iniciar_ejecucion_mcp', {
          p_credencial_id: credencialId, p_feature_id: accion.feature_id,
        })
        if (inicioError || !ejecucionId) return { content: [{ type: 'text', text: inicioError?.message ?? 'No se pudo iniciar la ejecución.' }], isError: true }

        // El cliente MCP externo no decide la organización, nunca: si sus
        // parametros incluyen una clave con pinta de organización, se pisa
        // acá con el valor resuelto por la credencial, sin importar qué
        // mandó. No se inyecta si la RPC real no la pide (evitaría romper
        // firmas que no la tienen) — esto es un override, no una garantía
        // tan fuerte como mcp_leer_fila: cada RPC registrada en
        // acciones_mcp sigue siendo responsable de resolver/validar su
        // propia organización, no de confiar en cualquier valor recibido
        // (constraint documentado en research.md para quien registre una
        // funcionalidad ejecutable nueva).
        const parametrosSeguros = { ...(parametros ?? {}) }
        for (const clave of Object.keys(parametrosSeguros)) {
          if (/organizacion_id$/i.test(clave)) parametrosSeguros[clave] = organizacionId
        }

        const { data, error } = await admin.rpc(accion.rpc, parametrosSeguros)

        await admin.rpc('finalizar_ejecucion_mcp', {
          p_ejecucion_id: ejecucionId,
          p_estado: error ? 'fallida' : 'completada',
          p_motivo_error: error?.message ?? null,
        })

        if (error) return { content: [{ type: 'text', text: error.message }], isError: true }
        return { content: [{ type: 'text', text: JSON.stringify(data) }] }
      },
    )
  }
}
