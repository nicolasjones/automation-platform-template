import { Alert, Button, Chip, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, MenuItem, Paper, Select, Stack, Switch, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material'
import { List } from '@refinedev/mui'
import { useCallback, useEffect, useState } from 'react'
import { EstadoCargaPagina, EstadoVacio } from '../../components/estados/EstadosPagina'
import { useIsSuperadmin } from '../../hooks/useIsSuperadmin'
import { supabaseClient } from '../../lib/supabase'

type Funcionalidad = { id: string; nombre: string }
type Capacidad = { feature_id: string; lectura: boolean; ejecucion: boolean }
type Organizacion = { id: string; nombre: string }
type Credencial = { id: string; organizacion_id: string; creada_en: string; revocada_en: string | null }

// Pantalla de plataforma (US3) — dos concerns separados: qué es seguro
// exponer vía MCP (tabla de capacidades por funcionalidad) y, por separado,
// qué organización tiene qué credencial activa. Mismo criterio que la
// pantalla análoga de la spec paralela chat-ia-supabase (en desarrollo
// simultáneo en otro worktree, no mergeada todavía — no es un archivo de
// este repo). Ver spec.md User Story 3.
export function IaCapacidadesMcp() {
  const { isSuperadmin, isLoading: cargandoRol } = useIsSuperadmin()
  const [funcionalidades, setFuncionalidades] = useState<Funcionalidad[] | null>(null)
  const [capacidades, setCapacidades] = useState<Record<string, Capacidad>>({})
  const [organizaciones, setOrganizaciones] = useState<Organizacion[]>([])
  const [credenciales, setCredenciales] = useState<Credencial[]>([])
  const [error, setError] = useState<string | null>(null)
  const [organizacionSeleccionada, setOrganizacionSeleccionada] = useState('')
  const [tokenGenerado, setTokenGenerado] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const [featuresRespuesta, capacidadesRespuesta, organizacionesRespuesta, credencialesRespuesta] = await Promise.all([
      supabaseClient.from('features').select('id, nombre').order('nombre'),
      supabaseClient.from('capacidades_mcp').select('feature_id, lectura, ejecucion'),
      supabaseClient.from('organizaciones').select('id, nombre').order('nombre'),
      supabaseClient.rpc('listar_credenciales_mcp'),
    ])
    const consultaError = featuresRespuesta.error ?? capacidadesRespuesta.error ?? organizacionesRespuesta.error ?? credencialesRespuesta.error
    if (consultaError) {
      setError(consultaError.message)
      return
    }
    setFuncionalidades((featuresRespuesta.data ?? []) as Funcionalidad[])
    setCapacidades(Object.fromEntries(((capacidadesRespuesta.data ?? []) as Capacidad[]).map((c) => [c.feature_id, c])))
    setOrganizaciones((organizacionesRespuesta.data ?? []) as Organizacion[])
    setCredenciales((credencialesRespuesta.data ?? []) as Credencial[])
  }, [])

  useEffect(() => {
    if (isSuperadmin) void cargar()
  }, [cargar, isSuperadmin])

  const cambiarCapacidad = useCallback(async (featureId: string, campo: 'lectura' | 'ejecucion', valor: boolean) => {
    setError(null)
    const existente = capacidades[featureId]
    const { error: rpcError } = await supabaseClient.rpc('actualizar_capacidad_mcp', {
      p_feature_id: featureId,
      p_lectura: campo === 'lectura' ? valor : (existente?.lectura ?? false),
      p_ejecucion: campo === 'ejecucion' ? valor : (existente?.ejecucion ?? false),
    })
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    await cargar()
  }, [capacidades, cargar])

  const generarCredencial = useCallback(async () => {
    if (!organizacionSeleccionada) return
    setError(null)
    const { data, error: rpcError } = await supabaseClient.rpc('generar_credencial_mcp', { p_organizacion_id: organizacionSeleccionada })
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    setTokenGenerado(data as string)
    await cargar()
  }, [organizacionSeleccionada, cargar])

  const revocarCredencial = useCallback(async (credencialId: string) => {
    setError(null)
    const { error: rpcError } = await supabaseClient.rpc('revocar_credencial_mcp', { p_credencial_id: credencialId })
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    await cargar()
  }, [cargar])

  if (cargandoRol) return <EstadoCargaPagina />
  if (!isSuperadmin) return <Alert severity="error" sx={{ m: 2 }}>Esta pantalla es solo para el superadmin de la plataforma.</Alert>

  return (
    <List title="Capacidades del Servidor MCP">
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

      <Typography variant="subtitle1" sx={{ mb: 1 }}>Capacidades por funcionalidad</Typography>
      {funcionalidades === null ? (
        <EstadoCargaPagina />
      ) : funcionalidades.length === 0 ? (
        <EstadoVacio titulo="Todavía no hay funcionalidades en el catálogo" descripcion="Las funcionalidades se registran desde su propia migración." />
      ) : (
        <TableContainer component={Paper} variant="outlined" sx={{ mb: 4 }}>
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
                        onChange={(evento) => void cambiarCapacidad(funcionalidad.id, 'lectura', evento.target.checked)}
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Switch
                        checked={capacidad?.ejecucion ?? false}
                        onChange={(evento) => void cambiarCapacidad(funcionalidad.id, 'ejecucion', evento.target.checked)}
                      />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Typography variant="subtitle1" sx={{ mb: 1 }}>Credenciales por organización</Typography>
      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        <Select
          size="small"
          displayEmpty
          value={organizacionSeleccionada}
          onChange={(evento) => setOrganizacionSeleccionada(evento.target.value)}
          sx={{ minWidth: 240 }}
        >
          <MenuItem value="" disabled>Elegir organización</MenuItem>
          {organizaciones.map((organizacion) => <MenuItem key={organizacion.id} value={organizacion.id}>{organizacion.nombre}</MenuItem>)}
        </Select>
        <Button variant="contained" disabled={!organizacionSeleccionada} onClick={() => void generarCredencial()}>
          Generar credencial
        </Button>
      </Stack>

      {credenciales.length === 0 ? (
        <EstadoVacio titulo="Todavía no hay credenciales generadas" />
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Organización</TableCell>
                <TableCell>Creada</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell align="right">Acción</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {credenciales.map((credencial) => (
                <TableRow key={credencial.id}>
                  <TableCell>{organizaciones.find((o) => o.id === credencial.organizacion_id)?.nombre ?? credencial.organizacion_id}</TableCell>
                  <TableCell>{new Date(credencial.creada_en).toLocaleString()}</TableCell>
                  <TableCell>
                    {credencial.revocada_en
                      ? <Chip size="small" label="Revocada" color="default" />
                      : <Chip size="small" label="Activa" color="success" />}
                  </TableCell>
                  <TableCell align="right">
                    {!credencial.revocada_en && (
                      <Button size="small" color="error" onClick={() => void revocarCredencial(credencial.id)}>Revocar</Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog open={tokenGenerado !== null} onClose={() => setTokenGenerado(null)}>
        <DialogTitle>Credencial generada</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Copiá este valor ahora — no se puede volver a ver después de cerrar este diálogo (FR-005).
          </DialogContentText>
          <TextField fullWidth multiline value={tokenGenerado ?? ''} slotProps={{ input: { readOnly: true } }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTokenGenerado(null)}>Cerrar</Button>
        </DialogActions>
      </Dialog>
    </List>
  )
}
