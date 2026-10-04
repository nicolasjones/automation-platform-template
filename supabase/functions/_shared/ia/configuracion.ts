import { proveedorDelCatalogo } from './proveedores/catalogo.ts'
import { descubrirModelos, type FetchModelos, type ModeloDescubierto } from './proveedores/index.ts'

export type CredencialDescubrimiento = { proveedorCodigo: string; adaptador: string; clave: string }

export type RepositorioConfiguracionIa = {
  obtenerClaveCredencial: (credencialId: string) => Promise<CredencialDescubrimiento>
  registrarModelos: (credencialId: string, modelos: ModeloDescubierto[]) => Promise<void>
  crearPerfil: (credencialId: string, modeloId: string, nombre: string, activo?: boolean) => Promise<string>
}

export async function descubrirYRegistrarModelos(
  repositorio: RepositorioConfiguracionIa,
  credencialId: string,
  fetchModelos: FetchModelos,
): Promise<ModeloDescubierto[]> {
  const credencial = await repositorio.obtenerClaveCredencial(credencialId)
  if (proveedorDelCatalogo(credencial.proveedorCodigo).adaptador !== credencial.adaptador) {
    throw new Error('CREDENCIAL_IA_INCONSISTENTE')
  }
  const modelos = await descubrirModelos(credencial.proveedorCodigo, credencial.clave, fetchModelos)
  await repositorio.registrarModelos(credencialId, modelos)
  return modelos
}

export async function crearPerfilDesdeModeloDescubierto(
  repositorio: RepositorioConfiguracionIa,
  credencialId: string,
  modeloId: string,
  nombre: string,
): Promise<string> {
  if (!modeloId || !nombre.trim()) throw new Error('PERFIL_IA_INVALIDO')
  return repositorio.crearPerfil(credencialId, modeloId, nombre.trim(), true)
}
