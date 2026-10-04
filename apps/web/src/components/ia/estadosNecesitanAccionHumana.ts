import type { EstadoInteraccion } from '@platform/ia'

export const ESTADOS_NECESITAN_ACCION_HUMANA: readonly EstadoInteraccion[] = ['revision_humana', 'esperando_aprobacion']
