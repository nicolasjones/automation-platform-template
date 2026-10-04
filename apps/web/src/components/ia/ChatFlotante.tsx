import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline'
import CloseIcon from '@mui/icons-material/Close'
import { Box, Drawer, Fab, IconButton, Typography } from '@mui/material'
import { useEffect, useState } from 'react'
import { ChatIAPanel } from './ChatIAPanel'
import { useContextoPanel } from '../../hooks/useContextoPanel'
import { supabaseClient } from '../../lib/supabase'

// Companion persistente del Chat IA (pedido explícito del usuario,
// 2026-10-04): antes vivía solo en /ia/chat, una pantalla a la que había
// que navegar — ahora acompaña cualquier pantalla del panel vía un botón
// flotante + drawer, mismo backend (chat-ia-responder) y mismo chequeo de
// feature flag que la pantalla dedicada (que sigue existiendo tal cual).
// Vive dentro de ThemedLayout en App.tsx, al mismo nivel que <Outlet />,
// para que no dependa de en qué ruta está parado el usuario.
export function ChatFlotante() {
  const { contexto } = useContextoPanel()
  const [habilitado, setHabilitado] = useState(false)
  const [abierto, setAbierto] = useState(false)

  useEffect(() => {
    if (!contexto?.organizacion_id) {
      setHabilitado(false)
      return
    }
    void supabaseClient
      .rpc('tiene_feature_publica', { p_feature_id: 'chat-ia' })
      .then(({ data }) => setHabilitado(Boolean(data)), () => setHabilitado(false))
  }, [contexto?.organizacion_id])

  // Sin organización activa o sin el feature habilitado, ni el botón
  // aparece — ChatIAPanel ya maneja esos casos con su propio mensaje
  // cuando se entra por /ia/chat directo, pero acá preferimos no mostrar
  // ni el disparador.
  if (!habilitado) return null

  return (
    <>
      <Fab
        color="primary"
        aria-label="Abrir Chat IA"
        onClick={() => setAbierto(true)}
        sx={{ position: 'fixed', bottom: 24, right: 24, zIndex: (theme) => theme.zIndex.drawer + 1 }}
      >
        <ChatBubbleOutlineIcon />
      </Fab>
      <Drawer anchor="right" open={abierto} onClose={() => setAbierto(false)}>
        <Box sx={{ width: { xs: '100vw', sm: 420 }, height: '100%', display: 'flex', flexDirection: 'column', p: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="h6">Chat IA</Typography>
            <IconButton aria-label="Cerrar" onClick={() => setAbierto(false)}>
              <CloseIcon />
            </IconButton>
          </Box>
          <Box sx={{ flex: 1, minHeight: 0 }}>
            <ChatIAPanel altura="100%" />
          </Box>
        </Box>
      </Drawer>
    </>
  )
}
