import { Alert, Stack, Typography } from '@mui/material'
import type { EstadoInteraccion } from '@platform/ia'
import { List } from '@refinedev/mui'
import { useCallback, useEffect, useState } from 'react'
import { AccionesResolucionInteraccionIA } from '../../components/ia/AccionesResolucionInteraccionIA'
import { InsigniaEstadoInteraccionIA } from '../../components/ia/InsigniaEstadoInteraccionIA'
import { EstadoCargaPagina, EstadoVacio } from '../../components/estados/EstadosPagina'
import { useIsSuperadmin } from '../../hooks/useIsSuperadmin'
import { supabaseClient } from '../../lib/supabase'

type Interaccion = { id: string; consumidor_codigo: string; origen: string; estado: EstadoInteraccion; intentos: number; iniciada_en: string; finalizada_en: string | null; error_sanitizado: string | null }

export function IaInteracciones() {
  const { isSuperadmin, isLoading } = useIsSuperadmin()
  const [interacciones, setInteracciones] = useState<Interaccion[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const { data, error: consultaError } = await supabaseClient
      .from('ia_interacciones')
      .select('id,consumidor_codigo,origen,estado,intentos,iniciada_en,finalizada_en,error_sanitizado')
      .order('iniciada_en', { ascending: false })
    if (consultaError) setError(consultaError.message)
    else setInteracciones((data ?? []) as Interaccion[])
  }, [])

  useEffect(() => {
    if (isSuperadmin) void cargar()
  }, [cargar, isSuperadmin])

  if (isLoading) return <EstadoCargaPagina />
  if (!isSuperadmin) return <Alert severity="error" sx={{ m: 2 }}>Esta pantalla es solo para el superadmin de la plataforma.</Alert>

  return (
    <List title="Interacciones de IA">
      <Stack spacing={2}>
        <Alert severity="info">El historial contiene sólo estados, contadores, errores y evidencia sanitizados. Las revisiones humanas se resuelven exclusivamente aquí.</Alert>
        {error && <Alert severity="error">{error}</Alert>}
        {interacciones === null ? (
          <EstadoCargaPagina />
        ) : interacciones.length === 0 ? (
          <EstadoVacio titulo="Todavía no hay interacciones de IA registradas." />
        ) : (
          interacciones.map((interaccion) => (
            <Stack key={interaccion.id} spacing={0.5} sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 1 }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography>{`${interaccion.consumidor_codigo} · ${interaccion.origen} · intento ${interaccion.intentos}`}</Typography>
                <InsigniaEstadoInteraccionIA estado={interaccion.estado} />
              </Stack>
              <Typography variant="body2">{new Date(interaccion.iniciada_en).toLocaleString()}</Typography>
              {interaccion.error_sanitizado && <Typography color="error">{interaccion.error_sanitizado}</Typography>}
              <AccionesResolucionInteraccionIA interaccionId={interaccion.id} estado={interaccion.estado} onResuelto={cargar} />
            </Stack>
          ))
        )}
      </Stack>
    </List>
  )
}
