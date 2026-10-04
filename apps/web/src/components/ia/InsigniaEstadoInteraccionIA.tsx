import { Chip, CircularProgress, useMediaQuery } from '@mui/material'
import type { EstadoInteraccion } from '@platform/ia'

type Categoria =
  | { tipo: 'progreso'; etiqueta: string }
  | { tipo: 'color'; color: 'success' | 'warning' | 'error'; etiqueta: string }

// Los dos estados con color 'warning' son exactamente ESTADOS_NECESITAN_ACCION_HUMANA
// (no se derivan de ahí: esta tabla es presentación, esa constante es elegibilidad de
// acciones — conceptos distintos que hoy coinciden). Si se agrega un estado a uno,
// revisar si corresponde también en el otro.
const CATEGORIA_POR_ESTADO: Record<EstadoInteraccion, Categoria> = {
  iniciada: { tipo: 'progreso', etiqueta: 'En curso' },
  preparando: { tipo: 'progreso', etiqueta: 'En curso' },
  invocando: { tipo: 'progreso', etiqueta: 'En curso' },
  respuesta_validada: { tipo: 'progreso', etiqueta: 'En curso' },
  completada: { tipo: 'color', color: 'success', etiqueta: 'Completada' },
  esperando_aprobacion: { tipo: 'color', color: 'warning', etiqueta: 'Espera aprobación' },
  revision_humana: { tipo: 'color', color: 'warning', etiqueta: 'Revisión humana' },
  rechazada: { tipo: 'color', color: 'error', etiqueta: 'Rechazada' },
  fallida_tecnica: { tipo: 'color', color: 'error', etiqueta: 'Falla técnica' },
  cancelada: { tipo: 'color', color: 'error', etiqueta: 'Cancelada' },
}

export function InsigniaEstadoInteraccionIA({ estado }: { estado: EstadoInteraccion }) {
  const prefiereMenosMovimiento = useMediaQuery('(prefers-reduced-motion: reduce)')
  const categoria = CATEGORIA_POR_ESTADO[estado]
  if (categoria.tipo === 'progreso') {
    const indicador = prefiereMenosMovimiento
      ? <CircularProgress size={14} color="inherit" variant="determinate" value={75} />
      : <CircularProgress size={14} color="inherit" />
    return <Chip size="small" icon={indicador} label={categoria.etiqueta} />
  }
  return <Chip size="small" color={categoria.color} label={categoria.etiqueta} />
}
