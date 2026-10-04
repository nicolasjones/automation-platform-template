import { Alert, Paper, Switch, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material'
import { List } from '@refinedev/mui'
import { useCallback, useEffect, useState } from 'react'
import { EstadoCargaPagina, EstadoVacio } from '../../components/estados/EstadosPagina'
import { useIsSuperadmin } from '../../hooks/useIsSuperadmin'
import { supabaseClient } from '../../lib/supabase'

type Funcionalidad = { id: string; nombre: string }
type Capacidad = { feature_id: string; lectura: boolean; ejecucion: boolean }

// Pantalla de plataforma (US3): una fila por funcionalidad conectable al
// chat, dos Switch independientes — Lectura y Ejecución — igual criterio
// de "toggle inmediato, sin guardado en lote" que GrillaFeaturesPorOrganizacion
// (T021). Deliberadamente separada de esa grilla: acá se decide QUÉ es
// seguro ofrecer a nivel plataforma, no QUIÉN lo tiene habilitado — ver
// spec.md User Story 3.
export function IaCapacidadesChat() {
  const { isSuperadmin, isLoading: cargandoRol } = useIsSuperadmin()
  const [funcionalidades, setFuncionalidades] = useState<Funcionalidad[] | null>(null)
  const [capacidades, setCapacidades] = useState<Record<string, Capacidad>>({})
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const [featuresRespuesta, capacidadesRespuesta] = await Promise.all([
      supabaseClient.from('features').select('id, nombre').order('nombre'),
      supabaseClient.from('capacidades_chat_ia').select('feature_id, lectura, ejecucion'),
    ])
    const consultaError = featuresRespuesta.error ?? capacidadesRespuesta.error
    if (consultaError) {
      setError(consultaError.message)
      return
    }
    setFuncionalidades((featuresRespuesta.data ?? []) as Funcionalidad[])
    setCapacidades(Object.fromEntries(((capacidadesRespuesta.data ?? []) as Capacidad[]).map((c) => [c.feature_id, c])))
  }, [])

  useEffect(() => {
    if (isSuperadmin) void cargar()
  }, [cargar, isSuperadmin])

  const cambiar = useCallback(async (featureId: string, campo: 'lectura' | 'ejecucion', valor: boolean) => {
    setError(null)
    const rpc = campo === 'lectura' ? 'actualizar_capacidad_chat_lectura' : 'actualizar_capacidad_chat_ejecucion'
    const parametro = campo === 'lectura' ? { p_feature_id: featureId, p_lectura: valor } : { p_feature_id: featureId, p_ejecucion: valor }
    const { error: rpcError } = await supabaseClient.rpc(rpc, parametro)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    await cargar()
  }, [cargar])

  if (cargandoRol) return <EstadoCargaPagina />
  if (!isSuperadmin) return <Alert severity="error" sx={{ m: 2 }}>Esta pantalla es solo para el superadmin de la plataforma.</Alert>

  return (
    <List title="Capacidades del Chat IA">
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
      {funcionalidades === null ? (
        <EstadoCargaPagina />
      ) : funcionalidades.length === 0 ? (
        <EstadoVacio titulo="Todavía no hay funcionalidades en el catálogo" descripcion="Las funcionalidades se registran desde su propia migración." />
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Funcionalidad</TableCell>
                <TableCell align="center">Lectura</TableCell>
                <TableCell align="center">Ejecución</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {funcionalidades.map((funcionalidad) => {
                const capacidad = capacidades[funcionalidad.id]
                return (
                  <TableRow key={funcionalidad.id}>
                    <TableCell><Typography variant="body2">{funcionalidad.nombre}</Typography></TableCell>
                    <TableCell align="center">
                      <Switch
                        checked={capacidad?.lectura ?? false}
                        onChange={(evento) => void cambiar(funcionalidad.id, 'lectura', evento.target.checked)}
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Switch
                        checked={capacidad?.ejecucion ?? false}
                        onChange={(evento) => void cambiar(funcionalidad.id, 'ejecucion', evento.target.checked)}
                      />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </List>
  )
}
