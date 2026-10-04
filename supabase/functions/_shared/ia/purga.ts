export type EvidenciaPendiente = { interaccionId: string; evidenciaPath: string }
export type RepositorioPurgaIa = {
  evidenciasPendientes: (hasta: Date) => Promise<EvidenciaPendiente[]>
  eliminarEvidencia: (path: string) => Promise<void>
  finalizarPurga: (interacciones: string[]) => Promise<number>
}

// El borrado físico se delega a Storage API. Si una eliminación falla no se
// confirma la fila: el siguiente ciclo vuelve a intentarla de forma segura.
export async function purgarEvidenciasVencidas(repositorio: RepositorioPurgaIa, hasta = new Date()): Promise<number> {
  const pendientes = await repositorio.evidenciasPendientes(hasta)
  const eliminadas: string[] = []
  for (const evidencia of pendientes) {
    await repositorio.eliminarEvidencia(evidencia.evidenciaPath)
    eliminadas.push(evidencia.interaccionId)
  }
  return eliminadas.length === 0 ? 0 : repositorio.finalizarPurga(eliminadas)
}
