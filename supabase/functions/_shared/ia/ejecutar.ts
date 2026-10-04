import type { ContextoOrganizacion, ContratoConsumidor } from './types.ts'
import { validarPoliticaActiva, type PoliticaActiva } from './politicas.ts'
import { marcarContenidoNoConfiable, sanitizarDato } from './sanitizar.ts'
import { validarPresupuesto, validarContraEsquema } from './validarContrato.ts'
import { validarAislamientoOrganizacion } from './contextoOrganizacion.ts'

export function prepararInvocacion(
  contrato: ContratoConsumidor,
  politica: PoliticaActiva,
  entrada: unknown,
  intentos: number,
  iniciadoEn: Date,
  contextoOrganizacion: ContextoOrganizacion = { organizacionId: null },
): Record<string, unknown> {
  validarPoliticaActiva(politica)
  validarPresupuesto(intentos, politica.limiteIntentos, iniciadoEn, politica.limiteSegundos)
  validarContraEsquema(entrada, contrato.esquemaEntrada, 'ENTRADA_IA_FUERA_DE_ESQUEMA')
  validarAislamientoOrganizacion(entrada, contrato.claveAislamientoOrganizacion, contextoOrganizacion)
  const sanitizada = sanitizarDato(entrada, contrato.datosPermitidos)
  if (!sanitizada || typeof sanitizada !== 'object' || Array.isArray(sanitizada)) throw new Error('ENTRADA_IA_INVALIDA')
  const resultado = sanitizada as Record<string, unknown>
  // Contenido declarado como no confiable (clavesNoConfiables) se envuelve
  // acá, no a mano por el consumidor: ningún consumidor existente lo
  // declara, así que sin esto el bucle siempre vacío deja el resultado
  // idéntico (FR-006, spec saneamiento-contenido-ia).
  for (const clave of contrato.clavesNoConfiables ?? []) {
    if (typeof resultado[clave] === 'string') resultado[clave] = marcarContenidoNoConfiable(resultado[clave])
  }
  return resultado
}

export function perfilParaFalloTecnico(politica: PoliticaActiva, tipoFallo: 'tecnico' | 'timeout' | 'respuesta_invalida' | 'contrato' | 'verificador'): string | null {
  validarPoliticaActiva(politica)
  if (tipoFallo === 'contrato' || tipoFallo === 'verificador') return null
  return politica.perfilFallbackId ?? null
}
