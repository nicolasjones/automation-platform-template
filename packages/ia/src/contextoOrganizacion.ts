import type { ContextoOrganizacion } from './types.js'

export function validarAislamientoOrganizacion(
  entrada: unknown,
  claveAislamiento: string | null | undefined,
  contexto: ContextoOrganizacion,
): void {
  if (!claveAislamiento) return

  const recorrer = (valor: unknown): void => {
    if (Array.isArray(valor)) {
      valor.forEach(recorrer)
      return
    }
    if (valor && typeof valor === 'object') {
      for (const [clave, dato] of Object.entries(valor as Record<string, unknown>)) {
        if (clave === claveAislamiento && dato !== contexto.organizacionId) throw new Error('ORGANIZACION_IA_NO_AUTORIZADA')
        recorrer(dato)
      }
    }
  }

  recorrer(entrada)
}
