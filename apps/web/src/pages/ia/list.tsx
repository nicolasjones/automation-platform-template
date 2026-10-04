import { Alert, Button, List as MuiList, ListItem, ListItemText, Stack } from '@mui/material'
import { List } from '@refinedev/mui'
import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router'
import { useIsSuperadmin } from '../../hooks/useIsSuperadmin'
import { supabaseClient } from '../../lib/supabase'

type Proveedor = { id: string; nombre: string; habilitado: boolean }

export function IaList() {
  const { isSuperadmin, isLoading } = useIsSuperadmin()
  const [proveedores, setProveedores] = useState<Proveedor[]>([])

  useEffect(() => {
    if (isSuperadmin) void supabaseClient.from('ia_proveedores').select('id, nombre, habilitado').then(({ data }) => setProveedores((data ?? []) as Proveedor[]))
  }, [isSuperadmin])

  if (isLoading) return null
  if (!isSuperadmin) return <Alert severity="error" sx={{ m: 2 }}>Esta pantalla es solo para el superadmin de la plataforma.</Alert>

  return (
    <List title="IA gobernada">
      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        <Button component={RouterLink} to="/ia/proveedores" variant="contained">Proveedores</Button>
        <Button component={RouterLink} to="/ia/modelos">Modelos y perfiles</Button>
        <Button component={RouterLink} to="/ia/contratos">Contratos</Button>
        <Button component={RouterLink} to="/ia/politicas">Políticas</Button>
        <Button component={RouterLink} to="/ia/interacciones">Interacciones</Button>
        <Button component={RouterLink} to="/ia/capacidades-mcp">Capacidades MCP</Button>
        <Button component={RouterLink} to="/ia/capacidades-chat">Capacidades del Chat</Button>
      </Stack>
      <MuiList>{proveedores.map((proveedor) => <ListItem key={proveedor.id}><ListItemText primary={proveedor.nombre} secondary={proveedor.habilitado ? 'Habilitado' : 'Pendiente de verificación'} /></ListItem>)}</MuiList>
    </List>
  )
}
