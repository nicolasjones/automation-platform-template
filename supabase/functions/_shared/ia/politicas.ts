export type PoliticaActiva = {
  id: string
  contratoId: string
  perfilPrincipalId: string
  perfilFallbackId?: string | null
  limiteIntentos: number
  limiteSegundos: number
  estado: 'aprobada'
}

export function validarPoliticaActiva(politica: PoliticaActiva): void {
  if (politica.estado !== 'aprobada' || !politica.id || !politica.contratoId || !politica.perfilPrincipalId) throw new Error('POLITICA_IA_INACTIVA')
  if (!Number.isInteger(politica.limiteIntentos) || politica.limiteIntentos < 1 || politica.limiteIntentos > 2) throw new Error('LIMITE_INTENTOS_IA_INVALIDO')
  if (!Number.isInteger(politica.limiteSegundos) || politica.limiteSegundos < 1 || politica.limiteSegundos > 90) throw new Error('LIMITE_TIEMPO_IA_INVALIDO')
}
