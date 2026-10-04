import { describe, expect, it, vi } from 'vitest'
import type { ContratoConsumidor, PoliticaActiva } from '@platform/ia'
import { intentarRecuperarPaso } from './intentarRecuperarPaso.js'
import type { AccionPermitida, AdaptadorInvocacionIa, PasoRecuperable } from './tipos.js'

const DOMINIO = 'ejemplo.test'

function contratoFixture(): ContratoConsumidor {
  return {
    codigo: 'fallback-navegacion-fixture',
    version: 1,
    esquemaEntrada: {},
    esquemaSalida: {},
    datosPermitidos: ['pagina', 'bloqueo'],
    limiteIntentos: 2,
    limiteSegundos: 90,
  }
}

function politicaFixture(overrides: Partial<PoliticaActiva> = {}): PoliticaActiva {
  return {
    id: 'politica-fixture',
    contratoId: 'contrato-fixture',
    perfilPrincipalId: 'perfil-principal',
    perfilFallbackId: null,
    limiteIntentos: 2,
    limiteSegundos: 90,
    estado: 'aprobada',
    ...overrides,
  }
}

const accionClick: AccionPermitida = { tipo: 'click_en_elemento', objetivo: 'boton_confirmar' }
const permisoCompletarMoneda: AccionPermitida = { tipo: 'completar_campo', objetivo: 'campo_moneda', valorPermitido: ['USD', 'ARS'] }

function pasoFixture(overrides: Partial<PasoRecuperable> = {}): PasoRecuperable {
  return {
    alcance: { dominioPermitido: DOMINIO },
    accionesPermitidas: [accionClick],
    verificador: vi.fn(async () => true),
    checkpoint: { idempotencyKey: 'checkpoint-fixture' },
    contexto: { pagina: 'reporte', bloqueo: 'filtro' },
    ...overrides,
  }
}

function adaptadorFixture(overrides: Partial<AdaptadorInvocacionIa> = {}): AdaptadorInvocacionIa {
  return {
    invocarProveedor: vi.fn(async () => accionClick),
    resolverObjetivo: vi.fn(() => ({ dominio: DOMINIO })),
    ejecutarAccion: vi.fn(async () => undefined),
    ...overrides,
  }
}

describe('intentarRecuperarPaso — User Story 1: recuperación exitosa', () => {
  it('ejecuta exactamente una acción del vocabulario declarado y devuelve estado recuperado', async () => {
    const paso = pasoFixture()
    const adaptador = adaptadorFixture()

    const resultado = await intentarRecuperarPaso(paso, politicaFixture(), contratoFixture(), adaptador)

    expect(resultado.estado).toBe('recuperado')
    expect(adaptador.ejecutarAccion).toHaveBeenCalledTimes(1)
    expect(adaptador.ejecutarAccion).toHaveBeenCalledWith(accionClick)
  })

  it('completar_campo ejecuta con el valor concreto que propone la IA, dentro de lo permitido', async () => {
    const paso = pasoFixture({ accionesPermitidas: [permisoCompletarMoneda] })
    const adaptador = adaptadorFixture({
      invocarProveedor: vi.fn(async () => ({ tipo: 'completar_campo', objetivo: 'campo_moneda', valor: 'ARS' })),
    })

    const resultado = await intentarRecuperarPaso(paso, politicaFixture(), contratoFixture(), adaptador)

    expect(resultado.estado).toBe('recuperado')
    expect(adaptador.ejecutarAccion).toHaveBeenCalledWith({ tipo: 'completar_campo', objetivo: 'campo_moneda', valor: 'ARS' })
  })

  it('con perfil de fallback configurado, un fallo técnico del principal reintenta con el fallback y puede recuperar', async () => {
    const paso = pasoFixture()
    let llamada = 0
    const invocarProveedor = vi.fn(async (_entrada: Record<string, unknown>, _perfilId: string) => {
      llamada += 1
      if (llamada === 1) throw new Error('timeout')
      return accionClick
    })
    const adaptador = adaptadorFixture({ invocarProveedor })
    const politica = politicaFixture({ perfilFallbackId: 'perfil-fallback', limiteIntentos: 2 })

    const resultado = await intentarRecuperarPaso(paso, politica, contratoFixture(), adaptador)

    expect(resultado.estado).toBe('recuperado')
    expect(invocarProveedor).toHaveBeenCalledTimes(2)
    expect(invocarProveedor.mock.calls[0]?.[1]).toBe('perfil-principal')
    expect(invocarProveedor.mock.calls[1]?.[1]).toBe('perfil-fallback')
  })
})

describe('intentarRecuperarPaso — User Story 2: checkpoint y no duplicación', () => {
  it('devuelve el checkpoint declarado idéntico, solo en éxito', async () => {
    const checkpoint = { idempotencyKey: 'checkpoint-unico' }
    const paso = pasoFixture({ checkpoint })

    const resultado = await intentarRecuperarPaso(paso, politicaFixture(), contratoFixture(), adaptadorFixture())

    expect(resultado.estado).toBe('recuperado')
    if (resultado.estado === 'recuperado') expect(resultado.checkpoint).toBe(checkpoint)
  })

  it('en un resultado no_recuperable, checkpoint es null', async () => {
    const paso = pasoFixture()
    const politicaInactiva = politicaFixture({ id: '' })

    const resultado = await intentarRecuperarPaso(paso, politicaInactiva, contratoFixture(), adaptadorFixture())

    expect(resultado.estado).toBe('no_recuperable')
    expect(resultado.checkpoint).toBeNull()
  })

  it('nunca llama a ejecutarAccion más de una vez por invocación', async () => {
    const paso = pasoFixture({ verificador: vi.fn(async () => false) })
    const adaptador = adaptadorFixture()

    await intentarRecuperarPaso(paso, politicaFixture(), contratoFixture(), adaptador)

    expect(adaptador.ejecutarAccion).toHaveBeenCalledTimes(1)
  })
})

describe('intentarRecuperarPaso — User Story 3: casos no recuperables', () => {
  it('rechaza sin ejecutar cuando la acción propuesta no pertenece al vocabulario declarado', async () => {
    const paso = pasoFixture()
    const adaptador = adaptadorFixture({
      invocarProveedor: vi.fn(async () => ({ tipo: 'click_en_elemento', objetivo: 'boton_no_declarado' })),
    })

    const resultado = await intentarRecuperarPaso(paso, politicaFixture(), contratoFixture(), adaptador)

    expect(resultado).toMatchObject({ estado: 'no_recuperable', motivo: 'accion_no_declarada', checkpoint: null })
    expect(adaptador.ejecutarAccion).not.toHaveBeenCalled()
  })

  it('completar_campo con un valor fuera de valorPermitido se rechaza como accion_no_declarada, sin ejecutar', async () => {
    const paso = pasoFixture({ accionesPermitidas: [permisoCompletarMoneda] })
    const adaptador = adaptadorFixture({
      invocarProveedor: vi.fn(async () => ({ tipo: 'completar_campo', objetivo: 'campo_moneda', valor: 'EUR' })),
    })

    const resultado = await intentarRecuperarPaso(paso, politicaFixture(), contratoFixture(), adaptador)

    expect(resultado).toMatchObject({ estado: 'no_recuperable', motivo: 'accion_no_declarada' })
    expect(adaptador.ejecutarAccion).not.toHaveBeenCalled()
  })

  it('rechaza sin ejecutar cuando el objetivo resuelve a un dominio distinto del declarado', async () => {
    const paso = pasoFixture()
    const adaptador = adaptadorFixture({ resolverObjetivo: vi.fn(() => ({ dominio: 'otro-dominio.test' })) })

    const resultado = await intentarRecuperarPaso(paso, politicaFixture(), contratoFixture(), adaptador)

    expect(resultado).toMatchObject({ estado: 'no_recuperable', motivo: 'dominio_no_autorizado', checkpoint: null })
    expect(adaptador.ejecutarAccion).not.toHaveBeenCalled()
  })

  it('un verificador que resuelve false termina de inmediato sin segunda llamada a ejecutarAccion', async () => {
    const paso = pasoFixture({ verificador: vi.fn(async () => false) })
    const adaptador = adaptadorFixture()

    const resultado = await intentarRecuperarPaso(paso, politicaFixture(), contratoFixture(), adaptador)

    expect(resultado).toMatchObject({ estado: 'no_recuperable', motivo: 'verificador_rechazado', checkpoint: null })
    expect(adaptador.ejecutarAccion).toHaveBeenCalledTimes(1)
  })

  it('un verificador que lanza se trata igual que uno que resuelve false', async () => {
    const paso = pasoFixture({ verificador: vi.fn(async () => { throw new Error('boom') }) })

    const resultado = await intentarRecuperarPaso(paso, politicaFixture(), contratoFixture(), adaptadorFixture())

    expect(resultado).toMatchObject({ estado: 'no_recuperable', motivo: 'verificador_rechazado' })
  })

  it('una política inactiva devuelve sin_politica_activa sin invocar al proveedor', async () => {
    const paso = pasoFixture()
    const adaptador = adaptadorFixture()
    const politicaInactiva = politicaFixture({ id: '' })

    const resultado = await intentarRecuperarPaso(paso, politicaInactiva, contratoFixture(), adaptador)

    expect(resultado).toMatchObject({ estado: 'no_recuperable', motivo: 'sin_politica_activa' })
    expect(adaptador.invocarProveedor).not.toHaveBeenCalled()
  })

  it('un presupuesto de tiempo ya agotado devuelve presupuesto_agotado sin invocar al proveedor', async () => {
    // El contador de intentos nunca puede agotarse en este chequeo previo:
    // arranca en 0 y validarPoliticaActiva exige limiteIntentos >= 1, así
    // que 0 < limiteIntentos siempre se cumple. La única forma real de que
    // packages/ia rechace ANTES del primer intento es por tiempo — de ahí
    // el reloj inyectado, en vez de reducir limiteIntentos (ver bug
    // encontrado en code-review: validar con el contador ya incrementado
    // por iniciarInvocacion rompía el fallback técnico).
    const paso = pasoFixture()
    const adaptador = adaptadorFixture()
    const haceMucho = () => new Date(Date.now() - 999_000)

    const resultado = await intentarRecuperarPaso(paso, politicaFixture(), contratoFixture(), adaptador, haceMucho)

    expect(resultado).toMatchObject({ estado: 'no_recuperable', motivo: 'presupuesto_agotado' })
    expect(adaptador.invocarProveedor).not.toHaveBeenCalled()
  })

  it('no expone ni recibe ningún contador de intentos propio distinto al de la política', () => {
    // El reloj inyectable tiene valor por defecto, así que no cuenta en
    // Function.length (ver MDN: los parámetros con default no se cuentan).
    expect(intentarRecuperarPaso.length).toBe(4)
  })

  it('un error técnico sin perfil de fallback configurado devuelve error_tecnico sin ejecutar ninguna acción', async () => {
    const paso = pasoFixture()
    const adaptador = adaptadorFixture({ invocarProveedor: vi.fn(async () => { throw new Error('timeout') }) })

    const resultado = await intentarRecuperarPaso(paso, politicaFixture({ perfilFallbackId: null }), contratoFixture(), adaptador)

    expect(resultado).toMatchObject({ estado: 'no_recuperable', motivo: 'error_tecnico' })
    expect(adaptador.ejecutarAccion).not.toHaveBeenCalled()
  })

  it('un error técnico que agota también el fallback devuelve error_tecnico', async () => {
    const paso = pasoFixture()
    const adaptador = adaptadorFixture({ invocarProveedor: vi.fn(async () => { throw new Error('timeout') }) })
    const politica = politicaFixture({ perfilFallbackId: 'perfil-fallback', limiteIntentos: 2 })

    const resultado = await intentarRecuperarPaso(paso, politica, contratoFixture(), adaptador)

    expect(resultado).toMatchObject({ estado: 'no_recuperable', motivo: 'error_tecnico' })
    expect(adaptador.invocarProveedor).toHaveBeenCalledTimes(2)
  })

  it('un paso sin acciones permitidas se detiene sin invocar al proveedor, motivo sin_acciones_permitidas', async () => {
    const paso = pasoFixture({ accionesPermitidas: [] })
    const adaptador = adaptadorFixture()

    const resultado = await intentarRecuperarPaso(paso, politicaFixture(), contratoFixture(), adaptador)

    expect(resultado).toMatchObject({ estado: 'no_recuperable', motivo: 'sin_acciones_permitidas' })
    expect(adaptador.invocarProveedor).not.toHaveBeenCalled()
  })
})
