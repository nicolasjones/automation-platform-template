import { Alert, Box, Button, Chip, IconButton, List as MuiList, ListItem, ListItemText, Stack, TextField, Tooltip } from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { List } from '@refinedev/mui'
import { useCallback, useEffect, useRef, useState } from 'react'
import { EstadoCargaPagina, EstadoVacio } from '../../components/estados/EstadosPagina'
import { useContextoPanel } from '../../context/ContextoPanel'
import { supabaseClient } from '../../lib/supabase'

type Documento = { id: string; nombre: string; creado_en: string }
type VersionDocumento = { id: string; estado: string; subida_en: string; motivo_error: string | null }

export function IaDocumentos() {
  const { contexto, isLoading: cargandoContexto } = useContextoPanel()
  const [habilitado, setHabilitado] = useState<boolean | null>(null)
  const [documentos, setDocumentos] = useState<Documento[] | null>(null)
  const [versionesPorDocumento, setVersionesPorDocumento] = useState<Record<string, VersionDocumento[]>>({})
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pregunta, setPregunta] = useState('')
  const [preguntando, setPreguntando] = useState(false)
  const [respuesta, setRespuesta] = useState<{ texto: string; citas: number } | null>(null)
  const inputArchivoRef = useRef<HTMLInputElement>(null)
  const documentoAActualizarRef = useRef<string | null>(null)

  useEffect(() => {
    if (!contexto?.organizacion_id) return
    void supabaseClient.rpc('tiene_feature_publica', { p_feature_id: 'busqueda-documental' }).then(({ data }) => setHabilitado(Boolean(data)))
  }, [contexto?.organizacion_id])

  const cargarDocumentos = useCallback(async () => {
    const { data } = await supabaseClient.from('documentos').select('id, nombre, creado_en').order('creado_en', { ascending: false })
    setDocumentos((data ?? []) as Documento[])
  }, [])

  useEffect(() => {
    if (habilitado) void cargarDocumentos()
  }, [habilitado, cargarDocumentos])

  const verHistorial = useCallback(async (documentoId: string) => {
    const { data } = await supabaseClient
      .from('versiones_documento')
      .select('id, estado, subida_en, motivo_error')
      .eq('documento_id', documentoId)
      .order('subida_en', { ascending: false })
    setVersionesPorDocumento((previo) => ({ ...previo, [documentoId]: (data ?? []) as VersionDocumento[] }))
  }, [])

  const subirArchivo = useCallback(async (archivo: File) => {
    if (!contexto?.organizacion_id) return
    setSubiendo(true)
    setError(null)

    const documentoId = documentoAActualizarRef.current
    documentoAActualizarRef.current = null

    try {
      let docId = documentoId
      if (!docId) {
        const { data: nuevoDoc, error: docError } = await supabaseClient.from('documentos').insert({ nombre: archivo.name }).select('id').single()
        if (docError || !nuevoDoc) throw new Error(docError?.message ?? 'No se pudo crear el documento.')
        docId = nuevoDoc.id
      }

      const versionId = crypto.randomUUID()
      const storagePath = `${contexto.organizacion_id}/${docId}/${versionId}`
      const { error: uploadError } = await supabaseClient.storage.from('documentos-rag').upload(storagePath, archivo)
      if (uploadError) throw new Error(uploadError.message)

      const { error: versionError } = await supabaseClient.from('versiones_documento').insert({ id: versionId, documento_id: docId, storage_path: storagePath, estado: 'procesando' })
      if (versionError) throw new Error(versionError.message)

      const { error: invokeError } = await supabaseClient.functions.invoke('indexar-documento', { body: { version_id: versionId } })
      if (invokeError) {
        let mensajeError = invokeError.message
        if (invokeError instanceof FunctionsHttpError) {
          const cuerpo = await invokeError.context.json().catch(() => null)
          mensajeError = cuerpo?.error ?? mensajeError
        }
        throw new Error(mensajeError)
      }

      await cargarDocumentos()
      if (docId) await verHistorial(docId)
    } catch (subidaError) {
      setError(subidaError instanceof Error ? subidaError.message : 'No se pudo subir el documento.')
    } finally {
      setSubiendo(false)
    }
  }, [contexto?.organizacion_id, cargarDocumentos, verHistorial])

  const eliminar = useCallback(async (documentoId: string) => {
    if (!window.confirm('¿Eliminar este documento? Esta acción borra el archivo y todo su contenido indexado, no se puede deshacer.')) return
    setError(null)
    const { error: rpcError } = await supabaseClient.rpc('eliminar_documento', { p_documento_id: documentoId })
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    await cargarDocumentos()
  }, [cargarDocumentos])

  const preguntar = useCallback(async () => {
    const texto = pregunta.trim()
    if (!texto || preguntando) return
    setPreguntando(true)
    setError(null)
    setRespuesta(null)

    const { data, error: invokeError } = await supabaseClient.functions.invoke<{ respuesta: string; documentos_citados: string[] }>(
      'preguntar-documentos',
      { body: { pregunta: texto } },
    )

    if (invokeError) {
      let mensajeError = invokeError.message
      if (invokeError instanceof FunctionsHttpError) {
        const cuerpo = await invokeError.context.json().catch(() => null)
        mensajeError = cuerpo?.error ?? mensajeError
      }
      setError(mensajeError)
    } else if (data) {
      setRespuesta({ texto: data.respuesta, citas: data.documentos_citados?.length ?? 0 })
    }
    setPreguntando(false)
  }, [pregunta, preguntando])

  if (cargandoContexto || habilitado === null) return <EstadoCargaPagina />
  if (!contexto?.organizacion_id) return <Alert severity="error" sx={{ m: 2 }}>Necesitás una organización activa.</Alert>
  if (!habilitado) return <Alert severity="info" sx={{ m: 2 }}>La búsqueda documental todavía no está habilitada para tu organización — pedile a un administrador que la active en el panel de funcionalidades.</Alert>

  return (
    <List title="Documentos">
      <Stack spacing={3}>
        {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

        <Stack direction="row" spacing={1} alignItems="center">
          <input
            ref={inputArchivoRef}
            type="file"
            accept=".txt,.pdf,.docx"
            style={{ display: 'none' }}
            onChange={(evento) => {
              const archivo = evento.target.files?.[0]
              if (archivo) void subirArchivo(archivo)
              evento.target.value = ''
            }}
          />
          <Button startIcon={<UploadFileIcon />} variant="contained" disabled={subiendo} onClick={() => inputArchivoRef.current?.click()}>
            {subiendo ? 'Subiendo...' : 'Subir documento'}
          </Button>
        </Stack>

        {documentos === null ? (
          <EstadoCargaPagina />
        ) : documentos.length === 0 ? (
          <EstadoVacio titulo="Todavía no hay documentos" descripcion="Subí un documento para empezar a preguntarle." />
        ) : (
          <MuiList>
            {documentos.map((documento) => (
              <ListItem
                key={documento.id}
                onClick={() => void verHistorial(documento.id)}
                secondaryAction={
                  <Stack direction="row" spacing={1}>
                    <Tooltip title="Actualizar (sube una nueva versión)">
                      <IconButton size="small" onClick={() => { documentoAActualizarRef.current = documento.id; inputArchivoRef.current?.click() }}>
                        <UploadFileIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Eliminar">
                      <IconButton size="small" color="error" onClick={() => void eliminar(documento.id)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                }
              >
                <ListItemText
                  primary={documento.nombre}
                  secondary={
                    versionesPorDocumento[documento.id]
                      ? versionesPorDocumento[documento.id].map((v) => `${v.estado}${v.motivo_error ? ` (${v.motivo_error})` : ''}`).join(' · ')
                      : 'Click para ver historial de versiones'
                  }
                />
              </ListItem>
            ))}
          </MuiList>
        )}

        <Box>
          <Stack direction="row" spacing={1}>
            <TextField
              fullWidth
              size="small"
              placeholder="Preguntale algo a tus documentos..."
              value={pregunta}
              onChange={(evento) => setPregunta(evento.target.value)}
              onKeyDown={(evento) => {
                if (evento.key === 'Enter') void preguntar()
              }}
              disabled={preguntando}
            />
            <Button variant="contained" onClick={() => void preguntar()} disabled={preguntando || !pregunta.trim()}>
              Preguntar
            </Button>
          </Stack>
          {respuesta && (
            <Alert severity="info" sx={{ mt: 2 }}>
              {respuesta.texto}
              {respuesta.citas > 0 && <Chip size="small" sx={{ ml: 1 }} label={`${respuesta.citas} documento(s) citado(s)`} />}
            </Alert>
          )}
        </Box>
      </Stack>
    </List>
  )
}
