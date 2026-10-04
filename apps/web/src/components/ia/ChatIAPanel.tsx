import { Alert, Box, Button, Stack, TextField } from '@mui/material'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { useCallback, useEffect, useRef, useState } from 'react'
import { MensajeChatIA, type Mensaje } from './MensajeChatIA'
import { EstadoCargaPagina, EstadoVacio } from '../estados/EstadosPagina'
import { useContextoPanel } from '../../hooks/useContextoPanel'
import { supabaseClient } from '../../lib/supabase'

// Lógica y UI completa del Chat IA, extraída para reusarse en 3 lugares
// (pedido explícito del usuario, 2026-10-04): la pantalla dedicada
// /ia/chat, el companion flotante global (ChatFlotante) y el contenido
// principal de Inicio — un solo lugar con la lógica real, nunca
// duplicada. `altura` deja que cada contexto decida cuánto espacio
// vertical ocupa (pantalla completa vs. dentro de un Drawer angosto).
export function ChatIAPanel({ altura = '70vh' }: { altura?: string }) {
  const { contexto, isLoading: cargandoContexto } = useContextoPanel()
  const [conversacionId, setConversacionId] = useState<string | null>(null)
  const [mensajes, setMensajes] = useState<Mensaje[]>([])
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [habilitado, setHabilitado] = useState<boolean | null>(null)
  const finRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!contexto?.organizacion_id) return
    void supabaseClient
      .rpc('tiene_feature_publica', { p_feature_id: 'chat-ia' })
      .then(({ data }) => setHabilitado(Boolean(data)), () => setHabilitado(false))
  }, [contexto?.organizacion_id])

  const cargarHistorial = useCallback(async (id: string) => {
    const { data } = await supabaseClient
      .from('mensajes_chat_ia')
      .select('id, origen, contenido, estado')
      .eq('conversacion_id', id)
      .order('creado_en', { ascending: true })
    if (data) setMensajes(data as Mensaje[])
  }, [])

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensajes])

  const enviar = useCallback(async () => {
    const mensaje = texto.trim()
    if (!mensaje || enviando) return
    setEnviando(true)
    setError(null)
    setTexto('')
    setMensajes((previos) => [...previos, { id: `local-${Date.now()}`, origen: 'usuario', contenido: mensaje, estado: null }])

    const { data, error: invokeError } = await supabaseClient.functions.invoke<{ conversacion_id: string; respuesta?: string; error?: string }>(
      'chat-ia-responder',
      { body: { conversacion_id: conversacionId, mensaje } },
    )

    if (invokeError) {
      let mensajeError = invokeError.message
      if (invokeError instanceof FunctionsHttpError) {
        const cuerpo = await invokeError.context.json().catch(() => null)
        mensajeError = cuerpo?.error ?? mensajeError
      }
      setError(mensajeError)
      setEnviando(false)
      return
    }

    if (data?.conversacion_id) {
      setConversacionId(data.conversacion_id)
      await cargarHistorial(data.conversacion_id)
    }
    setEnviando(false)
  }, [texto, enviando, conversacionId, cargarHistorial])

  const confirmar = useCallback(async (mensajeId: string) => {
    setError(null)
    const { data, error: rpcError } = await supabaseClient.rpc('ejecutar_accion_chat_ia', { p_mensaje_id: mensajeId })
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    if (data?.estado === 'fallida') setError(data.motivo ?? 'No se pudo ejecutar la acción.')
    if (conversacionId) await cargarHistorial(conversacionId)
  }, [conversacionId, cargarHistorial])

  if (cargandoContexto || habilitado === null) return <EstadoCargaPagina />
  if (!contexto?.organizacion_id) return <Alert severity="error">Necesitás una organización activa para usar el chat.</Alert>
  if (!habilitado) return <Alert severity="info">El Chat IA todavía no está habilitado para tu organización — pedile a un administrador que lo active en el panel de funcionalidades.</Alert>

  return (
    <Stack spacing={2} sx={{ height: altura }}>
      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
      <Box sx={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 1.5, p: 1 }}>
        {mensajes.length === 0 ? (
          <EstadoVacio titulo="Todavía no hay mensajes" descripcion="Preguntá algo sobre los datos habilitados para tu organización." />
        ) : (
          mensajes.map((mensaje) => (
            <MensajeChatIA
              key={mensaje.id}
              mensaje={mensaje}
              acciones={mensaje.estado === 'propuesta' ? (
                <Button size="small" variant="outlined" sx={{ mt: 1 }} onClick={() => void confirmar(mensaje.id)}>
                  Confirmar
                </Button>
              ) : undefined}
            />
          ))
        )}
        <div ref={finRef} />
      </Box>
      <Stack direction="row" spacing={1}>
        <TextField
          fullWidth
          size="small"
          placeholder="Escribí tu pregunta..."
          value={texto}
          onChange={(evento) => setTexto(evento.target.value)}
          onKeyDown={(evento) => {
            if (evento.key === 'Enter' && !evento.shiftKey) {
              evento.preventDefault()
              void enviar()
            }
          }}
          disabled={enviando}
        />
        <Button variant="contained" onClick={() => void enviar()} disabled={enviando || !texto.trim()}>
          Enviar
        </Button>
      </Stack>
    </Stack>
  )
}
