import { Box, Button, CircularProgress, Stack, Tooltip } from '@mui/material'
import type { EstadoInteraccion } from '@platform/ia'
import { useState } from 'react'
import { EstadoError } from '../estados/EstadosPagina'
import { supabaseClient } from '../../lib/supabase'
import { ESTADOS_NECESITAN_ACCION_HUMANA } from './estadosNecesitanAccionHumana'

export function AccionesResolucionInteraccionIA({
  interaccionId,
  estado,
  onResuelto,
}: {
  interaccionId: string
  estado: EstadoInteraccion
  onResuelto: () => void
}) {
  const [resolviendo, setResolviendo] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!ESTADOS_NECESITAN_ACCION_HUMANA.includes(estado)) return null

  const resolver = async (estadoFinal: 'completada' | 'rechazada' | 'cancelada') => {
    setResolviendo(true)
    setError(null)
    const { error: rpcError } = await supabaseClient.rpc('resolver_revision_ia', {
      p_interaccion_id: interaccionId,
      p_estado_final: estadoFinal,
      p_detalle_sanitizado: { resuelto_desde: 'refine' },
    })
    if (rpcError) setError(rpcError.message)
    else onResuelto()
    setResolviendo(false)
  }

  return (
    <Stack spacing={1}>
      <Box role="status" aria-live="polite">
        {error && <EstadoError titulo="No pudimos resolver esta interacción." descripcion={error} />}
      </Box>
      <Stack direction="row" spacing={1} alignItems="center">
        <Tooltip title="La IA propuso esto y queda registrado como aceptado.">
          <span>
            <Button disabled={resolviendo} onClick={() => void resolver('completada')}>Completar</Button>
          </span>
        </Tooltip>
        <Tooltip title="La propuesta de la IA no es correcta; queda registrada como rechazada, sin reintentar.">
          <span>
            <Button color="warning" disabled={resolviendo} onClick={() => void resolver('rechazada')}>Rechazar</Button>
          </span>
        </Tooltip>
        <Tooltip title="Se descarta esta interacción sin evaluar si la propuesta era correcta (ej. ya no hace falta resolverla).">
          <span>
            <Button color="error" disabled={resolviendo} onClick={() => void resolver('cancelada')}>Cancelar</Button>
          </span>
        </Tooltip>
        {resolviendo && <CircularProgress size={20} aria-label="Resolviendo" />}
      </Stack>
    </Stack>
  )
}
