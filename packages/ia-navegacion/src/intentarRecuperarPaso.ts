import {
  type PoliticaActiva,
  type ContratoConsumidor,
  type InteraccionEnCurso,
  prepararInvocacion,
  iniciarInteraccion,
  iniciarInvocacion,
  registrarFallo,
  completarInteraccion,
} from '@platform/ia'
import type { AccionPermitida, AccionPropuesta, AdaptadorInvocacionIa, MotivoNoRecuperable, PasoRecuperable, ResultadoInvocacion } from './tipos.js'

function accionPropuestaValida(propuesta: unknown, permitidas: readonly AccionPermitida[]): AccionPropuesta | null {
  if (!propuesta || typeof propuesta !== 'object') return null
  const candidata = propuesta as { tipo?: unknown; objetivo?: unknown; valor?: unknown }
  const declarada = permitidas.find((accion) => accion.tipo === candidata.tipo && accion.objetivo === candidata.objetivo)
  if (!declarada) return null

  if (declarada.tipo === 'completar_campo') {
    if (typeof candidata.valor !== 'string') return null
    if (declarada.valorPermitido && !declarada.valorPermitido.includes(candidata.valor)) return null
    return { tipo: 'completar_campo', objetivo: declarada.objetivo, valor: candidata.valor }
  }

  return { tipo: declarada.tipo, objetivo: declarada.objetivo }
}

function noRecuperable(interaccionId: string, motivo: MotivoNoRecuperable): ResultadoInvocacion {
  return { estado: 'no_recuperable', checkpoint: null, interaccionId, motivo }
}

// iniciarInvocacion avanza un solo estado por llamada (iniciada -> preparando
// -> invocando); se invoca dos veces para dejar la interacción directamente
// en 'invocando', con perfilEfectivoId = perfil principal e intentos = 1.
function abrirInvocacion(interaccion: InteraccionEnCurso, politica: PoliticaActiva): InteraccionEnCurso {
  return iniciarInvocacion(iniciarInvocacion(interaccion, politica), politica)
}

export async function intentarRecuperarPaso(
  paso: PasoRecuperable,
  politica: PoliticaActiva,
  contratoConsumidor: ContratoConsumidor,
  adaptadorIa: AdaptadorInvocacionIa,
  // Reloj inyectable solo para pruebas deterministas del presupuesto de
  // tiempo; un consumidor real nunca pasa este parámetro.
  ahora: () => Date = () => new Date(),
): Promise<ResultadoInvocacion> {
  const interaccionId = crypto.randomUUID()
  const iniciadoEn = ahora()

  if (paso.accionesPermitidas.length === 0) return noRecuperable(interaccionId, 'sin_acciones_permitidas')

  // Fase 'preparando': se valida ANTES de consumir el primer intento, con
  // el contador todavía en 0 — igual que packages/ia/src/ejecutar.test.ts.
  // Validar después de abrirInvocacion (como se hacía antes) usa el
  // contador ya incrementado y rompe el fallback técnico: con
  // limiteIntentos=2, tras el primer fallo registrarFallo deja intentos=2,
  // y una segunda validación con (2,2) lanza antes de probar el perfil de
  // fallback que acaba de conceder.
  let interaccion = iniciarInvocacion(iniciarInteraccion(), politica)

  let entradaSanitizada: Record<string, unknown>
  try {
    entradaSanitizada = prepararInvocacion(contratoConsumidor, politica, paso.contexto, interaccion.intentos, iniciadoEn)
  } catch (error) {
    const esPoliticaInactiva = error instanceof Error && error.message === 'POLITICA_IA_INACTIVA'
    return noRecuperable(interaccionId, esPoliticaInactiva ? 'sin_politica_activa' : 'presupuesto_agotado')
  }

  interaccion = iniciarInvocacion(interaccion, politica) // preparando -> invocando, intentos=1, perfil principal

  let propuesta: unknown
  for (;;) {
    const perfilActual = interaccion.perfilEfectivoId ?? politica.perfilPrincipalId
    try {
      propuesta = await adaptadorIa.invocarProveedor(entradaSanitizada, perfilActual)
      break
    } catch {
      // El presupuesto de intentos para este reintento ya lo valida
      // registrarFallo internamente (interaccion.intentos < limiteIntentos);
      // no se vuelve a llamar prepararInvocacion/validarPresupuesto acá.
      interaccion = registrarFallo(interaccion, politica, 'tecnico')
      if (interaccion.estado === 'invocando') continue // fallback técnico concedido, reintentar
      return noRecuperable(interaccionId, 'error_tecnico') // revision_humana, sin más fallback
    }
  }

  const accion = accionPropuestaValida(propuesta, paso.accionesPermitidas)
  if (!accion) {
    interaccion = registrarFallo(interaccion, politica, 'contrato')
    return noRecuperable(interaccionId, 'accion_no_declarada')
  }

  const objetivoResuelto = adaptadorIa.resolverObjetivo(accion.objetivo)
  if (!objetivoResuelto || objetivoResuelto.dominio !== paso.alcance.dominioPermitido) {
    interaccion = registrarFallo(interaccion, politica, 'contrato')
    return noRecuperable(interaccionId, 'dominio_no_autorizado')
  }

  await adaptadorIa.ejecutarAccion(accion)

  let verificado: boolean
  try {
    verificado = await paso.verificador(accion)
  } catch {
    verificado = false
  }

  if (!verificado) {
    interaccion = registrarFallo(interaccion, politica, 'verificador')
    return noRecuperable(interaccionId, 'verificador_rechazado')
  }

  completarInteraccion(interaccion)
  return { estado: 'recuperado', checkpoint: paso.checkpoint, interaccionId, motivo: null }
}
