import { describe, expect, it, vi } from 'vitest'
import { registrarHerramientas } from './herramientas.js'
import type { ConexionAutenticada } from './autenticacion.js'

// Mock mínimo de McpServer: solo necesitamos capturar qué se registró.
function crearServidorFalso() {
  const registradas: string[] = []
  return {
    registradas,
    registerTool: vi.fn((nombre: string) => { registradas.push(nombre) }),
  }
}

// Mock de un admin de supabase-js: responde según la tabla/rpc pedida.
function crearAdminFalso(opciones: {
  fuentes: Array<{ feature_id: string; vista: string; descripcion: string | null }>
  acciones: Array<{ feature_id: string; rpc: string; descripcion: string | null }>
  lecturaPermitida: Record<string, boolean>
  ejecucionPermitida: Record<string, boolean>
}) {
  return {
    from: (tabla: string) => ({
      select: () => {
        if (tabla === 'fuentes_mcp') return Promise.resolve({ data: opciones.fuentes })
        if (tabla === 'acciones_mcp') return Promise.resolve({ data: opciones.acciones })
        return Promise.resolve({ data: [] })
      },
    }),
    rpc: (nombre: string, parametros: Record<string, unknown>) => {
      if (nombre === 'puede_mcp_leer_funcionalidad') {
        return Promise.resolve({ data: opciones.lecturaPermitida[parametros.p_feature_id as string] ?? false })
      }
      if (nombre === 'puede_mcp_ejecutar_funcionalidad') {
        return Promise.resolve({ data: opciones.ejecucionPermitida[parametros.p_feature_id as string] ?? false })
      }
      if (nombre === 'resolver_credencial_id_mcp') return Promise.resolve({ data: 'credencial-falsa' })
      return Promise.resolve({ data: null })
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

describe('registrarHerramientas', () => {
  it('nunca registra leer_<feature> para una funcionalidad sin lectura habilitada a nivel plataforma (T014)', async () => {
    const admin = crearAdminFalso({
      fuentes: [
        { feature_id: 'con-lectura', vista: 'v1', descripcion: null },
        { feature_id: 'sin-lectura', vista: 'v2', descripcion: null },
      ],
      acciones: [],
      lecturaPermitida: { 'con-lectura': true, 'sin-lectura': false },
      ejecucionPermitida: {},
    })
    const servidor = crearServidorFalso()
    const conexion: ConexionAutenticada = { organizacionId: 'org-1', credencialId: 'credencial-falsa', admin, token: 'token-falso' }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await registrarHerramientas(servidor as any, conexion)

    expect(servidor.registradas).toContain('leer_con-lectura')
    expect(servidor.registradas).not.toContain('leer_sin-lectura')
  })

  it('nunca registra ejecutar_<feature> para una funcionalidad sin ejecución habilitada a nivel plataforma', async () => {
    const admin = crearAdminFalso({
      fuentes: [],
      acciones: [
        { feature_id: 'con-ejecucion', rpc: 'rpc_x', descripcion: null },
        { feature_id: 'sin-ejecucion', rpc: 'rpc_y', descripcion: null },
      ],
      lecturaPermitida: {},
      ejecucionPermitida: { 'con-ejecucion': true, 'sin-ejecucion': false },
    })
    const servidor = crearServidorFalso()
    const conexion: ConexionAutenticada = { organizacionId: 'org-1', credencialId: 'credencial-falsa', admin, token: 'token-falso' }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await registrarHerramientas(servidor as any, conexion)

    expect(servidor.registradas).toContain('ejecutar_con-ejecucion')
    expect(servidor.registradas).not.toContain('ejecutar_sin-ejecucion')
  })
})
