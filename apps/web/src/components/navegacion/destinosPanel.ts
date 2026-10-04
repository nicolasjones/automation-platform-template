import type { ComponentType } from 'react'
import type { SvgIconProps } from '@mui/material'
import HomeIcon from '@mui/icons-material/Home'
import BusinessCenterIcon from '@mui/icons-material/BusinessCenter'
import BarChartIcon from '@mui/icons-material/BarChart'
import HistoryIcon from '@mui/icons-material/History'
import HubIcon from '@mui/icons-material/Hub'
import GroupIcon from '@mui/icons-material/Group'
import SettingsIcon from '@mui/icons-material/Settings'
import SmartToyIcon from '@mui/icons-material/SmartToy'
import VpnKeyIcon from '@mui/icons-material/VpnKey'
import ExtensionIcon from '@mui/icons-material/Extension'
import DescriptionIcon from '@mui/icons-material/Description'
import type { ContextoPanel } from '../../context/ContextoPanel'

// Única fuente de secciones/destinos/audiencia del sider (spec
// 018-kit-panel-operable, Principio VI). Cada producto derivado reemplaza
// este archivo por sus propios destinos — el mecanismo (tipos,
// destinoVisible, SiderPanel) es lo que se porta, no esta lista.
export type AudienciaDestino = 'autenticada' | 'organizacion' | 'administrador' | 'superadmin'

export type DestinoPanel = {
  id: string
  etiqueta: string
  ruta: string
  icono: ComponentType<SvgIconProps>
  audiencia: AudienciaDestino
  rutasAnteriores?: string[]
}

export type SeccionPanel = {
  id: string
  etiqueta: string | null
  destinos: DestinoPanel[]
}

export const SECCIONES_PANEL: SeccionPanel[] = [
  {
    id: 'inicio',
    etiqueta: null,
    destinos: [
      { id: 'inicio', etiqueta: 'Inicio', ruta: '/', icono: HomeIcon, audiencia: 'autenticada' },
    ],
  },
  {
    id: 'operacion',
    etiqueta: 'Operación',
    destinos: [
      { id: 'clientes', etiqueta: 'Clientes', ruta: '/clientes', icono: BusinessCenterIcon, audiencia: 'organizacion' },
      { id: 'ejecuciones', etiqueta: 'Ejecuciones', ruta: '/ejecuciones', icono: HistoryIcon, audiencia: 'organizacion' },
      { id: 'analitica', etiqueta: 'Analítica', ruta: '/analitica', icono: BarChartIcon, audiencia: 'organizacion' },
      { id: 'chat-ia', etiqueta: 'Chat', ruta: '/ia/chat', icono: SmartToyIcon, audiencia: 'organizacion' },
      { id: 'documentos', etiqueta: 'Documentos', ruta: '/ia/documentos', icono: DescriptionIcon, audiencia: 'organizacion' },
    ],
  },
  {
    id: 'configuracion',
    etiqueta: 'Configuración',
    destinos: [
      { id: 'conexiones', etiqueta: 'Conexiones', ruta: '/conexiones', icono: HubIcon, audiencia: 'administrador' },
      { id: 'conexiones-oauth', etiqueta: 'Conexiones OAuth', ruta: '/conexiones-oauth', icono: VpnKeyIcon, audiencia: 'administrador' },
      { id: 'miembros', etiqueta: 'Miembros', ruta: '/miembros', icono: GroupIcon, audiencia: 'administrador' },
    ],
  },
  {
    id: 'plataforma',
    etiqueta: 'Plataforma',
    destinos: [
      { id: 'organizaciones', etiqueta: 'Organizaciones', ruta: '/organizaciones', icono: BusinessCenterIcon, audiencia: 'superadmin' },
      { id: 'servidores', etiqueta: 'Servidores', ruta: '/servidores', icono: HubIcon, audiencia: 'superadmin' },
      { id: 'funcionalidades', etiqueta: 'Funcionalidades', ruta: '/features/administrar', icono: SettingsIcon, audiencia: 'superadmin' },
      { id: 'analitica-administrar', etiqueta: 'Analítica (administrar)', ruta: '/analitica/administrar', icono: BarChartIcon, audiencia: 'superadmin' },
      { id: 'ia', etiqueta: 'IA gobernada', ruta: '/ia', icono: SmartToyIcon, audiencia: 'superadmin' },
      { id: 'integraciones-oauth', etiqueta: 'Integraciones OAuth', ruta: '/integraciones-oauth/administrar', icono: ExtensionIcon, audiencia: 'superadmin' },
    ],
  },
]

export const DESTINOS_PANEL: DestinoPanel[] = SECCIONES_PANEL.flatMap((seccion) => seccion.destinos)

// Para miembro/administrador siempre visible; para superadmin, solo con
// organización activa. 'administrador' reutiliza puede_escribir (contexto ya
// resuelve "administrador de su organización, o superadmin con organización
// activa").
export function destinoVisible(destino: DestinoPanel, contexto: ContextoPanel): boolean {
  switch (destino.audiencia) {
    case 'autenticada':
      return true
    case 'organizacion':
      return contexto.es_superadmin ? Boolean(contexto.organizacion_id) : true
    case 'administrador':
      return contexto.puede_escribir
    case 'superadmin':
      return contexto.es_superadmin
  }
}
