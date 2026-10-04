import { Authenticated, ErrorComponent, Refine, useGetIdentity } from '@refinedev/core'
import { RefineSnackbarProvider, ThemedLayout, useNotificationProvider } from '@refinedev/mui'
import { dataProvider as supabaseDataProvider } from '@refinedev/supabase'
import routerProvider, {
  CatchAllNavigate,
  DocumentTitleHandler,
  UnsavedChangesNotifier,
} from '@refinedev/react-router'
import { Avatar, CssBaseline, ThemeProvider, createTheme } from '@mui/material'
import { useEffect, useState } from 'react'
import { BrowserRouter, Link, Navigate, Outlet, Route, Routes } from 'react-router'
import { authProvider } from './providers/authProvider'
import { accessControlProvider } from './providers/accessControlProvider'
import { i18nProvider } from './providers/i18nProvider'
import { supabaseClient } from './lib/supabase'
import { RequiereOrganizacionActiva } from './components/RequiereOrganizacionActiva'
import { ContextoPanelProvider } from './context/ContextoPanel'
import { SiderPanel } from './components/navegacion/SiderPanel'
import { EncabezadoPanel } from './components/navegacion/EncabezadoPanel'
import { LoginPage } from './pages/login'
import { OrganizacionCreate } from './pages/organizaciones/create'
import { OrganizacionList } from './pages/organizaciones/list'
import { ServidorCreate } from './pages/servidores/create'
import { ServidorList } from './pages/servidores/list'
import { ConexionCreate } from './pages/conexiones/create'
import { ConexionEdit } from './pages/conexiones/edit'
import { ConexionList } from './pages/conexiones/list'
import { ConexionOAuthList } from './pages/conexiones-oauth/list'
import { IntegracionOAuthAdministrar } from './pages/integraciones-oauth/administrar'
import { EjecucionList } from './pages/ejecuciones/list'
import { EjecucionShow } from './pages/ejecuciones/show'
import { ClienteCreate } from './pages/clientes/create'
import { ClienteEdit } from './pages/clientes/edit'
import { ClienteList } from './pages/clientes/list'
import { AnaliticaAdministrar } from './pages/analitica/administrar'
import { AnaliticaList } from './pages/analitica/list'
import { AnaliticaPermisos } from './pages/analitica/permisos'
import { FeaturesAdministrar } from './pages/features/administrar'
import { MiembroCreate } from './pages/miembros/create'
import { MiembroList } from './pages/miembros/list'
import { DefinirContrasenaPage } from './pages/acceso/definir-contrasena'
import { SolicitarRecuperacionPage } from './pages/acceso/solicitar-recuperacion'
import { CambiarContrasenaPage } from './pages/cuenta/cambiar-contrasena'
import { CambiarCorreoPage } from './pages/cuenta/cambiar-correo'
import { PerfilPage } from './pages/cuenta/perfil'
import { IaList } from './pages/ia/list'
import { IaModelos } from './pages/ia/modelos'
import { IaProveedores } from './pages/ia/proveedores'
import { IaContratos } from './pages/ia/contratos'
import { IaPoliticas } from './pages/ia/politicas'
import { IaInteracciones } from './pages/ia/interacciones'
import { IaCapacidadesMcp } from './pages/ia/capacidades-mcp'
import './App.css'

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#136f63' },
    background: { default: '#f4f7f6' },
  },
  typography: { fontFamily: 'Inter, system-ui, sans-serif' },
})

const services = [
  ['Refine', 'Interfaz operativa', 'local :3100 · Vercel'],
  ['Supabase', 'Datos y autenticación', 'local :8100 · Cloud'],
  ['Kestra', 'Automatizaciones', 'local :8082 · VPS'],
  ['Superset', 'Reportes y métricas', 'local :8088 · VPS'],
]

// Home de quien ya inició sesión, hasta que exista una pantalla de negocio
// propia (organizaciones/clientes se agregan como recursos en las
// siguientes historias de la spec 003).
type Identity = { id: string; email?: string }

type PerfilIdentidad = { nombre: string | null; apellido: string | null }

export function IndicadorSesionActiva() {
  const { data: identity, isLoading } = useGetIdentity<Identity>()
  const [fotoUrl, setFotoUrl] = useState<string | null>(null)
  const [nombreCompleto, setNombreCompleto] = useState<string | null>(null)

  useEffect(() => {
    let activa = true
    if (!identity?.id) {
      setFotoUrl(null)
      setNombreCompleto(null)
      return () => { activa = false }
    }
    // La identidad solo solicita su propia fila; RLS impide leer perfiles ajenos.
    const cargarNombreCompleto = async () => {
      try {
        const { data } = await supabaseClient
          .from('perfiles_usuario')
          .select('nombre, apellido')
          .eq('user_id', identity.id)
          .maybeSingle<PerfilIdentidad>()
        if (activa) setNombreCompleto(data?.nombre && data?.apellido ? `${data.nombre} ${data.apellido}` : null)
      } catch {
        if (activa) setNombreCompleto(null)
      }
    }
    void cargarNombreCompleto()
    // La identidad solo solicita su propia ruta estable; Storage aplica RLS.
    void supabaseClient.storage.from('fotos-perfil').createSignedUrl(`${identity.id}/avatar`, 60)
      .then(({ data }) => { if (activa) setFotoUrl(data?.signedUrl ?? null) })
      .catch(() => { if (activa) setFotoUrl(null) })
    return () => { activa = false }
  }, [identity?.id])

  // Al cerrar la sesion Refine invalida la identidad y este componente deja de
  // renderizarla; asi no queda el correo anterior visible durante la salida.
  if (isLoading || !identity?.email) {
    return null
  }

  return (
    <p>
      <Avatar src={fotoUrl ?? undefined} alt="Tu foto de perfil" sx={{ width: 28, height: 28, display: 'inline-flex', verticalAlign: 'middle', mr: 1 }}>?</Avatar>
      Logueado como <strong>{nombreCompleto ?? identity.email}</strong>. <Link to="/cuenta/perfil">Ver mi perfil</Link>
    </p>
  )
}

function Home() {
  return (
    <main className="shell">
      <header className="hero">
        <p className="eyebrow">Automation Platform Template</p>
        <h1>Automatizaciones multi-tenant, coordinadas en un solo producto.</h1>
        <p className="lead">
          Base técnica preparada para desarrollar con Claude Code o Codex usando
          el mismo flujo de especificaciones.
        </p>
        <IndicadorSesionActiva />
      </header>

      <section className="grid" aria-label="Servicios del producto">
        {services.map(([name, purpose, destination]) => (
          <article className="card" key={name}>
            <h2>{name}</h2>
            <p>{purpose}</p>
            <small>{destination}</small>
          </article>
        ))}
      </section>
    </main>
  )
}

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <RefineSnackbarProvider>
          <Refine
            dataProvider={supabaseDataProvider(supabaseClient)}
            authProvider={authProvider}
            accessControlProvider={accessControlProvider}
            i18nProvider={i18nProvider}
            routerProvider={routerProvider}
            notificationProvider={useNotificationProvider}
            resources={[
              {
                name: 'organizaciones',
                list: '/organizaciones',
                create: '/organizaciones/create',
                meta: { label: 'Organizaciones' },
              },
              {
                name: 'servidores',
                list: '/servidores',
                create: '/servidores/create',
                meta: { label: 'Servidores' },
              },
              {
                name: 'clientes',
                list: '/clientes',
                create: '/clientes/create',
                edit: '/clientes/edit/:id',
                meta: { label: 'Clientes' },
              },
              { name: 'conexiones', list: '/conexiones', create: '/conexiones/create', edit: '/conexiones/edit/:id', meta: { label: 'Conexiones' } },
              { name: 'conexiones-oauth', list: '/conexiones-oauth', meta: { label: 'Conexiones OAuth' } },
              { name: 'integraciones-oauth-administrar', list: '/integraciones-oauth/administrar', meta: { label: 'Integraciones OAuth (administrar)' } },
              { name: 'ejecuciones', list: '/ejecuciones', show: '/ejecuciones/:id', meta: { label: 'Ejecuciones' } },
              {
                name: 'analitica-administrar',
                list: '/analitica/administrar',
                meta: { label: 'Analítica (administrar)' },
              },
              {
                name: 'analitica',
                list: '/analitica',
                meta: { label: 'Analítica' },
              },
              {
                name: 'features-administrar',
                list: '/features/administrar',
                meta: { label: 'Funcionalidades (administrar)' },
              },
              { name: 'miembros', list: '/miembros', create: '/miembros/create', meta: { label: 'Miembros' } },
              { name: 'cuenta', list: '/cuenta/perfil', meta: { label: 'Mi cuenta' } },
              { name: 'ia', list: '/ia', meta: { label: 'IA gobernada' } },
            ]}
            options={{
              syncWithLocation: true,
              warnWhenUnsavedChanges: true,
              disableTelemetry: true,
            }}
          >
            <ContextoPanelProvider>
            <Routes>
              <Route path="/acceso/definir-contrasena" element={<DefinirContrasenaPage />} />
              <Route path="/acceso/solicitar-recuperacion" element={<SolicitarRecuperacionPage />} />
              <Route
                element={
                  <Authenticated key="protegido" fallback={<CatchAllNavigate to="/login" />}>
                    <ThemedLayout Sider={SiderPanel} Header={EncabezadoPanel}>
                      <Outlet />
                    </ThemedLayout>
                  </Authenticated>
                }
              >
                <Route index element={<Home />} />
                <Route path="/organizaciones" element={<OrganizacionList />} />
                <Route path="/organizaciones/create" element={<OrganizacionCreate />} />
                <Route path="/servidores" element={<ServidorList />} />
                <Route path="/servidores/create" element={<ServidorCreate />} />
                <Route path="/conexiones" element={<RequiereOrganizacionActiva><ConexionList /></RequiereOrganizacionActiva>} />
                <Route path="/conexiones/create" element={<RequiereOrganizacionActiva><ConexionCreate /></RequiereOrganizacionActiva>} />
                <Route path="/conexiones/edit/:id" element={<RequiereOrganizacionActiva><ConexionEdit /></RequiereOrganizacionActiva>} />
                <Route path="/conexiones-oauth" element={<RequiereOrganizacionActiva><ConexionOAuthList /></RequiereOrganizacionActiva>} />
                <Route path="/integraciones-oauth/administrar" element={<IntegracionOAuthAdministrar />} />
                <Route path="/ejecuciones" element={<RequiereOrganizacionActiva><EjecucionList /></RequiereOrganizacionActiva>} />
                <Route path="/ejecuciones/:id" element={<RequiereOrganizacionActiva><EjecucionShow /></RequiereOrganizacionActiva>} />
                <Route
                  path="/clientes"
                  element={
                    <RequiereOrganizacionActiva>
                      <ClienteList />
                    </RequiereOrganizacionActiva>
                  }
                />
                <Route path="/miembros" element={<RequiereOrganizacionActiva><MiembroList /></RequiereOrganizacionActiva>} />
                <Route path="/miembros/create" element={<RequiereOrganizacionActiva><MiembroCreate /></RequiereOrganizacionActiva>} />
                <Route path="/cuenta/cambiar-contrasena" element={<CambiarContrasenaPage />} />
                <Route path="/cuenta/cambiar-correo" element={<CambiarCorreoPage />} />
                <Route path="/cuenta/perfil" element={<PerfilPage />} />
                <Route
                  path="/clientes/create"
                  element={
                    <RequiereOrganizacionActiva>
                      <ClienteCreate />
                    </RequiereOrganizacionActiva>
                  }
                />
                <Route
                  path="/clientes/edit/:id"
                  element={
                    <RequiereOrganizacionActiva>
                      <ClienteEdit />
                    </RequiereOrganizacionActiva>
                  }
                />
                <Route path="/analitica/administrar" element={<AnaliticaAdministrar />} />
                <Route
                  path="/analitica"
                  element={
                    <RequiereOrganizacionActiva>
                      <AnaliticaList />
                    </RequiereOrganizacionActiva>
                  }
                />
                <Route
                  path="/analitica/permisos"
                  element={
                    <RequiereOrganizacionActiva>
                      <AnaliticaPermisos />
                    </RequiereOrganizacionActiva>
                  }
                />
                <Route path="/features/administrar" element={<FeaturesAdministrar />} />
                <Route path="/ia" element={<IaList />} />
                <Route path="/ia/proveedores" element={<IaProveedores />} />
                <Route path="/ia/modelos" element={<IaModelos />} />
                <Route path="/ia/contratos" element={<IaContratos />} />
                <Route path="/ia/politicas" element={<IaPoliticas />} />
                <Route path="/ia/interacciones" element={<IaInteracciones />} />
                <Route path="/ia/capacidades-mcp" element={<IaCapacidadesMcp />} />
              </Route>

              <Route
                element={
                  <Authenticated key="publico" fallback={<Outlet />}>
                    <Navigate to="/" replace />
                  </Authenticated>
                }
              >
                <Route path="/login" element={<LoginPage />} />
              </Route>

              <Route
                element={
                  <Authenticated key="catch-all">
                    <ThemedLayout Sider={SiderPanel} Header={EncabezadoPanel}>
                      <Outlet />
                    </ThemedLayout>
                  </Authenticated>
                }
              >
                <Route path="*" element={<ErrorComponent />} />
              </Route>
            </Routes>
            </ContextoPanelProvider>
            <UnsavedChangesNotifier />
            <DocumentTitleHandler />
          </Refine>
        </RefineSnackbarProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}

export default App
