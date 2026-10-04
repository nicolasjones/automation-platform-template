import { Box, Chip, Paper, Typography } from '@mui/material'

export type Mensaje = {
  id: string
  origen: 'usuario' | 'chat'
  contenido: string
  estado: 'mensaje' | 'propuesta' | 'confirmada' | 'fallida' | null
}

export function MensajeChatIA({ mensaje, acciones }: { mensaje: Mensaje; acciones?: React.ReactNode }) {
  const esUsuario = mensaje.origen === 'usuario'
  return (
    <Box sx={{ display: 'flex', justifyContent: esUsuario ? 'flex-end' : 'flex-start' }}>
      <Paper
        variant="outlined"
        sx={{
          p: 1.5,
          maxWidth: '75%',
          bgcolor: esUsuario ? 'action.selected' : 'background.paper',
          borderColor: mensaje.estado === 'fallida' ? 'error.main' : undefined,
        }}
      >
        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{mensaje.contenido}</Typography>
        {mensaje.estado === 'propuesta' && <Chip size="small" color="warning" label="Esperando confirmación" sx={{ mt: 1 }} />}
        {mensaje.estado === 'confirmada' && <Chip size="small" color="success" label="Ejecutada" sx={{ mt: 1 }} />}
        {mensaje.estado === 'fallida' && <Chip size="small" color="error" label="No se pudo completar" sx={{ mt: 1 }} />}
        {acciones}
      </Paper>
    </Box>
  )
}
