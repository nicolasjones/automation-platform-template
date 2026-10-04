# Estrategia de producto técnico del template

**Estado:** exploratorio. Este documento orienta decisiones de plataforma; no
es una spec, no compromete fechas y no autoriza implementación. Cada capacidad
aprobada debe tener su propia spec, plan y tareas.

## Objetivo

Permitir crear y operar productos multi-tenant con rapidez, seguridad y
autonomía, sin rediseñar en cada producto la identidad, el aislamiento de
datos, la automatización, la calidad ni —cuando corresponda— las capacidades
de IA.

El éxito no es acumular servicios. El éxito es que un producto nuevo pueda
concentrarse en su dominio y usar una base técnica ya confiable.

## Estado actual

El template ya ofrece una fundación relevante:

- Autenticación, perfiles, organizaciones, membresías y roles.
- Aislamiento multi-tenant mediante RLS y pruebas pgTAP.
- Frontend operativo con Refine y rutas protegidas.
- Servicios independientes para Supabase, Kestra, Superset, Playwright y
runners.
- Migraciones, pruebas web, CI básico, datos seed y despliegue documentado.
- Panel de funcionalidades habilitables por organización, con comportamiento
fail-closed y auditoría.

## Backlog entregado

Estas capacidades ya están implementadas. La prioridad se asigna de forma
retrospectiva para mostrar qué fundamentos habilitan el backlog futuro; no
reemplaza las prioridades históricas de sus specs.


| Prioridad | Categoría       | Capacidad entregada                       | Dependencias                             | Resultado disponible                                                                                                                                                                                 | Estado       |
| --------- | --------------- | ------------------------------------------ | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| P0        | Infraestructura | Separación local por producto             | Ninguna                                  | Cada componente se levanta con su propio Compose y ciclo de desarrollo; no existe un Compose raíz. [Spec 001](../specs/001-separacion-local-por-producto/spec.md)                                    | Implementado |
| P0        | Fundación       | Template genérico de automatización       | Separación local por producto            | Monorepo reutilizable, convenciones de desarrollo, documentación y despliegues independientes para Refine, Supabase, Kestra, Superset y workers. [Spec 002](../specs/002-plantilla-generica/spec.md) | Implementado |
| P0        | Multi-tenancy   | Organizaciones, roles y RLS               | Fundación genérica                       | Organizaciones, membresía única, roles, contexto seguro y pruebas de aislamiento para datos expuestos. [Spec 003](../specs/003-fundacion-multitenant/spec.md)                                        | Implementado |
| P0        | Multi-tenancy   | Contexto de organización activa           | Organizaciones, roles y RLS              | Un superadmin entra y sale de una organización concreta; la interfaz y las policies operan fail-closed sin contexto activo. [Spec 004](../specs/004-contexto-organizacion-activa/spec.md)            | Implementado |
| P1        | Identidad       | Gestión de miembros                       | Organizaciones y contexto activo         | Administradores y superadmins con contexto pueden invitar, listar, cambiar rol y remover miembros, con auditoría y RLS. [Spec 005](../specs/005-gestion-miembros/spec.md)                            | Implementado |
| P0        | Identidad       | Autogestión de contraseña                 | Supabase Auth y rutas protegidas         | Invitación, definición, recuperación y cambio de contraseña con protecciones de sesión y notificaciones de Auth. [Spec 006](../specs/006-autogestion-contrasena/spec.md)                             | Implementado |
| P1        | Analítica       | Analítica embebida por organización       | Multi-tenancy y Superset                 | Reportes de Superset embebidos con acceso resuelto por organización y sin exponer credenciales de administración al navegador. [Spec 007](../specs/007-analitica-embebida/spec.md)                   | Implementado |
| P1        | Identidad       | Perfil personal y seguridad de cuenta     | Autogestión de contraseña, RLS y Storage | Perfil propio, cambio seguro de correo, fotos aisladas, resumen de cuenta y avisos de seguridad. [Spec 008](../specs/008-perfil-usuario/spec.md)                                                     | Implementado |
| P0        | Plataforma      | Panel de funcionalidades por organización | Multi-tenancy y contexto activo          | Catálogo, habilitación fail-closed por organización, administración de superadmin y auditoría de cambios. [Spec 009](../specs/009-panel-de-funcionalidades/spec.md)                                  | Implementado |
| P1        | Identidad       | Nombre visible entre miembros             | Gestión de miembros y perfil personal    | Nombre y apellido visibles entre miembros de una misma organización (antes solo UUID), con estado explícito si el perfil está incompleto. [Spec 010](../specs/010-nombre-miembros-organizacion/spec.md) | Implementado |
| P0        | Operación       | Backups automáticos de Postgres           | Ninguna                                  | Respaldo diario (o a demanda) de la base completa vía Kestra, con verificación estructural y registro auditable de estado/tamaño/error. Restauración queda fuera de esta entrega (ítem 6 del backlog priorizado). [Spec 011](../specs/011-backups-postgres/spec.md) | Implementado |
| P1        | Integraciones   | Convención de workers de integración      | Ninguna                                  | `workers/README.md` documenta runtime por defecto (Node.js + TypeScript), organización worker/conector, relación Kestra/worker, patrón de tabla central multi-tenant para normalizar datos de varias fuentes, y alcance explícitamente excluido (colas, backend síncrono). [La guía para diseñar conectores](./disenar-conector.md) separa esos mecanismos de las reglas que corresponden al producto y a su esquema `dominio`. No agrega infraestructura ni código de producto — es la convención que las specs de integración futuras (como la spec 013) siguen. [Spec 012](../specs/012-workers-conector-node-kestra/spec.md) | Implementado |
| P0        | Seguridad       | Blindaje de secretos en la orquestación   | Orquestación multi-organización (spec 013) | Acceso efímero y de mínimo privilegio a credenciales vía `private.obtener_credencial_para_worker(uuid)` (rol `workers_orquestacion`, sin `SELECT` directo a Vault ni a otras organizaciones); flows genérico y dedicado despachan por `secret()` sin resolver la credencial en Kestra; diagnóstico de fallas clasificado (técnica/credencial) con motivo sanitizado, sin `errorLogs()` ni valores secretos en alertas; arnés de regresión y recorrido E2E automatizado con credencial centinela que confirman cero apariciones (literal/URL/Base64) en outputs, logs y artefactos. [Spec 014](../specs/014-blindaje-secretos-kestra/spec.md) | Implementado |
| P2        | Infraestructura | Puertos de desarrollo local configurables | Separación local por producto            | Cada puerto de desarrollo local (Refine, Supabase API/DB/Studio/Mailpit/pooler/analítica/inspector, Kestra, Superset, Playwright) es una variable de entorno con default igual al puerto actual — permite correr el template y un producto derivado en paralelo en la misma máquina cambiando solo esas variables, con `supabase/config.toml` como única excepción documentada (limitación confirmada del CLI de Supabase). [Spec 015](../specs/015-puertos-configurables/spec.md) | Implementado |
| P0        | Infraestructura | Creador de productos derivados (guía)     | Puertos de desarrollo local configurables | Resuelto como documento, no como script ni spec: guía de proceso con la lista exacta de referencias de identidad a renombrar (Compose, `package.json`, `project_id` de Supabase), qué NO traer del template, y una verificación final por búsqueda de texto. Se gradúa a script solo si un segundo o tercer fork real muestra pasos mecánicos repetidos. [docs/crear-producto-derivado.md](./crear-producto-derivado.md) | Implementado |
| P1        | Orquestación   | Despacho durable de ejecuciones            | Kestra y workers                          | Outbox transaccional con reclamo exclusivo, lease, fencing, historial de intentos y contrato sin HTTP en SQL; el producto derivado adopta el mecanismo sin arrastrar conectores de dominio. [Spec 019](../specs/019-outbox-ejecuciones/spec.md) | Implementado |
| P1        | Tooling        | Tooling operativo portable                 | Node ESM y entornos locales               | Comandos operativos Node, validación de entradas sanitizada y sincronización local explícita del rol JDBC de Kestra; el recorrido E2E confirma éxito, clasificación de errores y ausencia de secretos persistidos. [Spec 020](../specs/020-tooling-typescript/spec.md) | Implementado |
| P1        | Orquestación   | Observabilidad de workers de navegador     | Ciclo de ejecuciones y blindaje de secretos | Contrato de eventos JSON por etapa y sanitización; las plantillas de despacho publican los logs y, con evidencia visual habilitada por entorno o por ejecución, las capturas de hitos como outputs de Kestra sin alterar el resultado de negocio; limpieza diaria idempotente de evidencia vencida (`EVIDENCIA_RETENCION_DIAS`, 30 por defecto). Publicada como `worker-execution-cycle` 1.1.0. [Spec](../specs/20260925-133820-observabilidad-workers-navegador/spec.md) | Implementado |
| P0        | Infraestructura | Base de datos del CI aislada               | Puertos de desarrollo local configurables y runners self-hosted | El job `database` levanta su propio stack de Supabase (`ci-<repo>`, puertos `20000 + p % 10000`) en vez de reutilizar y resetear el stack de desarrollo que comparte el Docker del host; reset y pgTAP pasan por una guarda que aborta si el destino no es ese stack. Capacidad `isolated-ci-database`; adopción en productos: [guía](./adoptar-ci-base-aislada.md). [Bug ci-supabase-desarrollo-compartido](../.specify/bugs/ci-supabase-desarrollo-compartido/assessment.md) | Implementado |
| P1        | Multi-tenancy   | Catálogo real para `sistema_externo`       | Orquestación multi-organización (spec 013) | Tabla catálogo (patrón `roles_organizacion`) para `conexiones.sistema_externo`, sin valores de negocio cargados — reemplaza el `text not null` libre por una entidad real, sin tocar el dato existente. Capacidad `catalog-sistema-externo`. [Spec](../specs/20260930-165358-catalogo-sistemas-externos/spec.md) | Implementado |
| P1        | Multi-tenancy   | Mapeo de identificadores externos de clientes | Fundación multi-tenant (spec 003) y Orquestación multi-organización (spec 013) | Tabla genérica `cliente_id` ↔ identificador externo de cualquier sistema, sin nombrar ningún sistema puntual — base reusable para que un producto derivado resuelva identidad de empresa/cliente sin reinventar matching por texto libre. Capacidad `mapeo-identificadores-externos`. [Spec](../specs/20260930-135541-mapeo-identificadores-clientes/spec.md) | Implementado |
| P1        | Integraciones   | Conexiones OAuth de plataforma vía Nango   | Fundación multi-tenant (spec 003) y Orquestación multi-organización (spec 013) | Nango self-hosted (`infra/nango/`) + catálogo de integraciones OAuth (`integraciones_oauth`/`conexiones_oauth`, con RLS) para que un producto derivado conecte cuentas de terceros (Google, etc.) por click, sin manejar tokens ni secretos del proveedor en el navegador. Validado en vivo de punta a punta con un login OAuth real y lectura de un Google Sheet real. Capacidad `oauth-connections-nango`; adopción en productos: [guía](./adoptar-conexiones-oauth.md). [Spec](../specs/20260930-153545-conexiones-oauth-nango/spec.md) | Implementado |


 La spec 003 conserva una tarea abierta de comprobación inicial de entorno;
la capacidad funcional está implementada y es dependencia de las specs
posteriores.

## Principios de producto

1. **El template aporta mecanismos; el producto aporta dominio.** El template
 no conoce reuniones, visitantes, facturas ni otras reglas particulares.
2. **Los productos son autónomos.** Un producto derivado conserva sus propios
 datos, secretos, entornos y despliegues; el template no participa en su
 ejecución diaria.
3. **Compartir es una decisión deliberada.** Una mejora vuelve al template solo
 si sirve a más de un dominio sin arrastrar conceptos del producto de origen.
4. **Sin infraestructura o abstracción vacía.** Una capacidad se construye al
 aparecer un caso de uso concreto y verificable.
5. **Seguridad y operación antes que comodidad.** RLS, secretos, recuperación,
 auditoría y pruebas no se reemplazan por revisiones manuales.
6. **La IA propone; las personas controlan.** Las acciones sensibles requieren
 permisos, confirmación humana y trazabilidad.

## Backlog priorizado

### ActualizaciÃ³n 2026-09-15 — Spec 013

La capacidad de orquestaciÃ³n de workers multi-organizaciÃ³n queda registrada como implementada: Supabase, Kestra, Refine y Superset compartidos; workers aislados por organizaciÃ³n despachados por SSH; flows genÃ©ricos paralelos con tope configurable y flows dedicados; secretos en Vault; RLS, alertas centralizadas y aprovisionamiento manual documentado. PgTAP, lint, build, Compose y una ejecuciÃ³n real del flow en Kestra fueron verificados. Queda pendiente una corrida E2E con servidor SSH de prueba y una organizaciÃ³n aprovisionada.

### Qué significa cada campo

- **Prioridad:** P0 bloquea trabajo posterior una vez que aparece su
disparador; P1 es la siguiente capacidad de alto valor una vez cubiertos los
P0 (o cuando aparece su propio disparador); P2 es útil pero se activa solo
con el primer caso de uso concreto; P3 se explora más adelante y no debe
generar infraestructura anticipada.
- **Dependencias:** qué otra capacidad de este backlog (o del backlog ya
entregado) tiene que existir antes de poder abrir la spec de esta.
- **Disparador:** el evento de producto real que habilita abrir la spec. Sin
él, el ítem se queda en Exploración sin importar su prioridad.
- **Estado:** todos los ítems siguen en **Exploración** hasta que una
decisión de producto abra su propia spec (ver [Regla para priorizar una
nueva capacidad](#regla-para-priorizar-una-nueva-capacidad)).

### Cómo se ordena la cola

Un backlog real es una única cola, no una tabla separada por tema. El orden
de la tabla siguiente sale de aplicar, en este orden:

0. **El dominio del futuro producto no es una condición de esta cola.**
Ninguna de las 23 capacidades necesita saber qué va a hacer el producto
derivado — todas están diseñadas como mecanismo genérico, sin conocimiento
de dominio (Principio 1; ver también Límites explícitos). No tener un
dominio pensado hoy **no pospone ningún ítem** de esta tabla. Lo único que
sigue siendo una condición real — y aparte del dominio — es el
**Disparador** de cada fila: un evento de un producto derivado real y en
marcha, sea cual sea su dominio. Sin al menos un producto derivado
existiendo, ningún disparador puede ocurrir; esa es la única razón por la
que hoy nada de esta tabla se activa, no la falta de un dominio elegido.
1. **Dependencia primero (restricción dura).** No se puede empezar una
capacidad antes que lo que necesita, y esto manda incluso sobre la
prioridad nominal: *Trazas, costos y evaluaciones* está etiquetada P0 pero
no puede empezar antes que *Auditoría transversal* (P1), porque depende de
ella. No es un error de esta tabla — es una alerta legítima del backlog:
hasta que exista la spec de Auditoría transversal, Trazas y costos no puede
avanzar aunque su prioridad nominal sea mayor.
2. **Prioridad**, entre las capacidades que ya tienen sus dependencias
resueltas.
3. **Valor de negocio**, como desempate dentro de una misma prioridad: se
adelanta lo que desbloquea más capacidades siguientes (por ejemplo,
*Gestión de entornos* se adelanta frente a otros P0 porque de ella dependen
seis capacidades más).

Los "horizontes" (Convertir la base en derivable / Operar con confianza / IA
segura / Bajo demanda) siguen sirviendo como agrupación temática para leer el
detalle de cada capacidad en la sección siguiente, pero **no determinan el
orden de ejecución** — ese orden es el de la tabla de abajo.

### Backlog único (orden de ejecución)

Se agrega una columna que no existía antes: **Tipo de disparador**. Sale
directo del punto 0 de arriba — como el dominio no importa, lo único que
distingue a un ítem de otro es si su disparador va a ocurrir en *cualquier*
producto derivado tarde o temprano (**Inevitable**), o si depende de que
ese producto elija construir esa función en particular, algo que puede no
pasar nunca (**Condicional**). No cambia el orden de la cola (eso lo siguen
dando dependencia, prioridad y valor); ayuda a leer cada fila con la
pregunta correcta: "Inevitable" es "esto va a pasar seguro, en algún
momento"; "Condicional" es "esto pasa *solo si* el producto termina
necesitando justo esta función".

| # | Prioridad | Capacidad | Horizonte | Dependencias | Disparador | Tipo de disparador | Resultado de salida | Estado |
| - | --------- | --------- | --------- | ------------- | ---------- | ------------------- | -------------------- | ------ |
| 2  | P0 | Gestión de entornos | H1 | Creador de productos derivados (ver Backlog entregado) | Primer despliegue de producto. | Inevitable | Contrato claro de variables, secretos, URLs y responsabilidades por entorno. | Exploración |
| 3  | P0 | Seguridad continua | H2 | Ninguna | Antes de producción y de forma continua. | Inevitable | Chequeos automatizados de dependencias, imágenes, secretos y configuración. | Exploración |
| 4  | P0 | Política de datos IA | H3 | Gestión de entornos y seguridad continua | Antes de datos reales en IA. | Condicional (solo si usa IA) | Reglas explícitas de datos permitidos, excluidos y tratamiento de errores. | Exploración |
| 5  | P0 | Versión de origen | H1 | Creador de productos derivados (ver Backlog entregado) | Primer producto derivado. | Inevitable | Cada producto registra el tag o commit de origen. | Exploración |
| 6  | P0 | Restauración | H2 | Backups (entregado, spec 011) | Antes de operar datos reales. | Inevitable | Restauración verificada en un entorno aislado. | Exploración |
| 7  | P0 | E2E en CI | H2 | Gestión de entornos | Primer flujo crítico de negocio. | Inevitable | Suite Playwright versionada que corre en CI para recorridos críticos. | Exploración |
| 8  | P0 | Monitoreo, alertas y errores | H2 | Gestión de entornos | Primer servicio de producción. | Inevitable | Healthchecks, registro central de errores y alertas ante fallos críticos. | Exploración |
| 9  | P0 | Gateway IA | H3 | Política de datos IA y gestión de entornos | Primera llamada a un modelo. | Condicional (solo si usa IA) | Backend único que aplica autenticación, límites y configuración de proveedor. [Spec de invocación real de proveedor](../specs/20261003-200240-gateway-ia/spec.md) | Parcialmente implementado: la gobernanza (auth/credenciales/límites/política) ya estaba centralizada en `prepararInvocacion` desde specs previas; esta spec cierra el gap real que faltaba — la llamada HTTP de invocación quedaba reimplementada por cada consumidor. `invocarProveedorIa` reutiliza la misma lógica de headers que ya usaba `descubrirModelos` para los cuatro adaptadores verificados (openai, openai-compatible, anthropic, gemini). No llega a "resuelto por composición, sin código nuevo" como el #19: no hay un único proceso de red que intermedie todas las llamadas, cada consumidor sigue ejecutando la suya — solo que ahora con la misma función compartida |
| 10 | P0 | Contexto y permisos IA | H3 | Gateway IA y RLS existente | Primera consulta IA sobre datos internos. | Condicional (solo si usa IA) | Cada ejecución recibe identidad, organización y alcance autorizados. [Spec de contexto y permisos de organización para IA](../specs/20261003-161758-contexto-permisos-ia/spec.md) | Implementado (aislamiento por organización en `prepararInvocacion`); identidad del actor y persistencia de interacciones quedan diferidas al gap preexistente de runtime (ver research.md de la spec) |
| 11 | P1 | Contratos de integración | H1 | Gestión de entornos | Primera integración nueva entre componentes. | Condicional (solo si integra componentes) | Convención documentada de autenticación, payloads, errores y versionado. | Exploración |
| 12 | P1 | Auditoría transversal | H2 | Contratos de integración | Primera operación sensible que cruce componentes. | Condicional (solo si hay operación sensible cruzando componentes) | Actor, organización, acción, resultado y momento consultables de forma uniforme. | Exploración |
| 13 | P0 | Trazas, costos y evaluaciones | H3 | Gateway IA y auditoría transversal | Primera capacidad IA en uso. | Condicional (solo si usa IA) | Registro de modelo, costo, fuentes, herramientas y casos de evaluación versionados. [Spec de costo estimado y arnés de evaluación](../specs/20261003-172145-trazas-costos-evaluaciones-ia/spec.md) | Parcialmente implementado: trazas ya las cubre `EventoInteraccion` desde `016-capacidad-ia-gobernada`; costo estimado y arnés de evaluación, resueltos como funciones puras sin tabla nueva. Pendiente si hiciera falta: descubrimiento de tarifas por proveedor y extracción de tokens de una respuesta real (ninguno de los dos tiene fuente hoy) |
| 14 | P1 | Adopción versionada de capacidades | H1 | Catálogo SemVer del template | Primera mejora que deba volver a un producto derivado. | Condicional (solo si vuelve una mejora) | Cada producto registra capacidades y versiones validadas; chequeo diario abre seguimiento sin copiar código ni hacer merges. [Spec de sincronización por capacidades](../specs/20260924-233045-sincronizacion-capacidades/spec.md) | Implementado; falta habilitar lectura privada en Sauger |
| 15 | P1 | Herramientas IA | H3 | Contexto y permisos IA; contratos de integración | Primera herramienta conectada al modelo. | Condicional (solo si usa IA) | Herramientas con contratos, permisos y validación de entradas/salidas. [Spec de validación real de esquemas](../specs/20261003-164825-herramientas-ia-esquemas/spec.md) | Implementado (contratos, permisos vía `datosPermitidos` y validación de esquemas de entrada/salida); la dependencia "contratos de integración" resultó no ser necesaria en la práctica — `ContratoConsumidor` ya era la función explícita que pedía este ítem, solo faltaba hacer cumplir sus esquemas |
| 16 | P1 | Aprobación humana | H3 | Herramientas IA y auditoría transversal | Primera acción con efecto externo o persistente. | Condicional (solo si hay acción automatizada con efecto externo) | Flujo propuesta → revisión → aprobación/rechazo → ejecución auditable. [Spec de aprobación humana](../specs/20261003-173044-aprobacion-humana-ia/spec.md) | Parcialmente implementado: estado `esperando_aprobacion` y transiciones `aprobarInteraccion`/`rechazarInteraccion` en `packages/ia`, opt-in y sin romper compatibilidad. Quién puede aprobar sigue siendo RLS de cada producto (mismo patrón que `revision_humana`); la tabla/pantalla real de aprobación queda pendiente para cuando exista un consumidor concreto |
| 17 | P2 | Archivos y documentos | H2 | Gestión de entornos | Primer producto que gestione documentos. | Condicional (solo si gestiona documentos) | Carga, acceso, retención y eliminación por organización con permisos explícitos. | Exploración |
| 18 | P2 | Notificaciones | H2 | Auditoría transversal | Primera notificación fuera de Auth. | Condicional (solo si notifica algo fuera de Auth) | Interfaz común para solicitar avisos; contenido y destinatarios siguen siendo del producto. | Exploración |
| 19 | P2 | Ejecuciones durables | H3 | Gateway IA y patrón Kestra existente | Primera tarea IA de larga duración. | Condicional (solo si usa IA) | Estados, reintentos y resultados sobre Kestra o workers. | Resuelto por composición (ver detalle) — sin código nuevo |
| 20 | P2 | UI de IA | H4 | Gateway IA; trazas y costos IA | Una capacidad IA necesita mostrar progreso, fuentes o aprobación. | Condicional (solo si usa IA) | Piezas visuales reutilizables: estado de generación, progreso, fuentes y aprobación de propuestas. [Spec de UI de IA y fix de esperando_aprobacion](../specs/20261003-182325-ui-ia-aprobacion-pendiente/spec.md) | Parcialmente implementado: insignia de estado (con indicador de progreso real para estados en curso) y acciones de resolución reutilizables, más el bug real de base que impedía alcanzar `esperando_aprobacion` — y un gap de autorización cerrado en el camino (`registrar_evento_interaccion_ia` no exigía superadmin para resolver una aprobación pendiente). Fuentes de una generación quedan pendientes para cuando exista un consumidor que las necesite (ej. RAG, #21) |
| 21 | P2 | Búsqueda documental/RAG | H4 | Archivos y documentos; contexto y permisos IA | Un producto necesita responder sobre documentos propios. | Condicional (documentos + IA) | Ingesta, indexación, búsqueda, permisos y referencias a las fuentes. [Spec de búsqueda documental genérica](../specs/20261005-document-rag-mechanism/spec.md) | Implementado: ingesta (extracción PDF/texto/Word, fragmentado, embeddings), búsqueda vectorial con pgvector, versionado sin ventana sin versión usable, eliminación real y referencias a los documentos de origen en la respuesta. La dependencia "Archivos y documentos" (#17) resultó no ser necesaria en la práctica — el bucket y la retención quedaron autocontenidos en esta spec, igual que pasó con #15 y "contratos de integración" |
| 22 | P3 | Paquetes compartidos | H4 | Dos productos reutilizando código estable | Dos o más productos usan la misma interfaz de código. | Condicional (requiere un segundo producto) | Paquete versionado, con pruebas y compatibilidad explícita entre productos. | Exploración |
| 23 | P3 | gRPC interno | H4 | Varios workers especializados y contratos definidos | Hay necesidad real de alto volumen o streaming. | Condicional (solo con volumen/streaming real) | Contratos fuertes y streaming entre workers especializados. | Exploración |
| 24 | P1 | Saneamiento de contenido no confiable para IA | H3 | Herramientas IA | Primera vez que una herramienta IA o el gateway procesan contenido externo no controlado por quien hace la consulta (resultado de un conector, documento subido, email). | Condicional (solo si usa IA y lee contenido externo) | Delimitadores y marcado explícito de contenido no confiable antes de enviarlo al modelo, con instrucción de sistema que impide tratarlo como órdenes propias y registro de cuándo se activó la defensa. [Spec de saneamiento de contenido no confiable](../specs/20261003-204520-saneamiento-contenido-ia/spec.md) | Implementado: disparador real (no especulativo) — `ai-navigation-fallback` ya lee contenido de una página web externa y lo pasaba sin marcar a la IA. `marcarContenidoNoConfiable` (delimitador con nonce aleatorio por invocación, no etiqueta fija — verificado contra el estado del arte 2026, no asumido) + instrucción de sistema explícita; `ContratoConsumidor.clavesNoConfiables` declara qué campos son contenido externo, `prepararInvocacion` los envuelve automáticamente; `clavesActivadas` da la señal de auditoría. `ai-navigation-fallback` no adopta el marcado todavía (decisión de producto separada) |
| 25 | P3 | Rate limiting en el borde de la API | H2 | Gestión de entornos | Primer endpoint público (REST/Refine) expuesto a tráfico no confiable, más allá del presupuesto que ya aplica Gateway IA solo a invocaciones de IA. | Condicional (solo si hay riesgo real de abuso) | Límite de tasa configurable por IP/organización en el borde, con respuesta consistente y registro del rechazo. | Exploración |
| 26 | P3 | Testing de carga/performance | H2 | E2E en CI | Primer flujo crítico con expectativa real de concurrencia o volumen (no solo corrección funcional). | Condicional (solo si hay expectativa real de carga) | Línea base de performance versionada (umbral de latencia/throughput) que corre bajo demanda, no en cada PR. | Exploración |
| 27 | P2 | Centro de notificaciones in-app | H2 | Notificaciones (#18) | Primer aviso que un usuario necesita ver sin salir del panel (no solo por correo). | Condicional (solo si el producto necesita avisos visibles dentro de la app) | Lista de notificaciones dentro del panel (campanita, marcar como leído) que consume lo que #18 ya dispara; #18 resuelve el envío, esto resuelve dónde se ve. | Exploración |
| 28 | P3 | Alta de organización autoservicio | H4 | Organizaciones, roles y RLS | Un producto derivado necesita que una organización se dé de alta sin intervención de un superadmin. | Condicional (hoy todo producto deriva organizaciones por provisión manual, modelo deliberado de consultoría) | Flujo de signup público que crea organización y primer admin sin RPC manual. | Exploración |
| 29 | P2 | Búsqueda global en el panel | H2 | Multi-tenancy | Varias organizaciones con volumen real de datos, donde cruzar entidades (miembros, ejecuciones, documentos) ya no entra en una sola pantalla. | Condicional (solo si hay volumen real de datos a cruzar) | Barra de búsqueda que cruza entidades del panel con los mismos límites de organización activa que ya aplica RLS — no reemplaza #21 (búsqueda semántica sobre documentos para IA). | Exploración |
| 30 | P1 | Exportación/portabilidad de datos de una organización | H2 | Multi-tenancy | Una organización pide llevarse sus datos o cerrar su cuenta. | Condicional (solo si el producto necesita dar portabilidad real) | Export completo y auditable de todo lo que pertenece a una organización, respetando los mismos límites que ya aplica RLS. | Exploración |
| 31 | P1 | Panel de consumo por organización | H2 | Multi-tenancy; Trazas, costos y evaluaciones IA (#13) | Soporte o capacidad necesitan ver cuánto usa una organización sin entrar a Superset. | Condicional (solo si hace falta visibilidad de uso sin billing) | Resumen de ejecuciones, almacenamiento y costo de IA por organización, consultable sin exportar a analítica. | Exploración |
| 32 | P1 | Branding por organización | H2 | Multi-tenancy | Un producto necesita mostrarse con identidad visual distinta por cliente final (logo, color, quizás subdominio). | Condicional (solo si el producto blanquea marca) | Configuración de marca por organización (logo, paleta, nombre visible) aplicada al panel sin tocar código por cliente. | Exploración |
| 33 | P1 | Soft-delete / papelera con recuperación | H2 | Multi-tenancy | Primera eliminación accidental real reportada, o primer dato con alto costo de pérdida. | Condicional (solo si el producto maneja datos cuya eliminación accidental es costosa) | Patrón de borrado lógico con ventana de recuperación y purga diferida, reutilizable entre tablas de producto — complementa, no reemplaza, los backups (#6). | Exploración |
| 34 | P2 | Reportes programados | H2 | Notificaciones (#18); Centro de notificaciones (#27); Analítica embebida | Un usuario necesita recibir un dashboard o export por cadencia, sin entrar a buscarlo. | Condicional (solo si hay reportes recurrentes reales) | Programación de envío periódico de un dashboard de Superset o un export, entregado vía #18/#27. | Exploración |
| 35 | P3 | Claves de API por organización | H4 | Multi-tenancy; Contratos de integración | Un cliente final necesita integrar su propio sistema contra la plataforma sin login de usuario. | Condicional (solo si hay integración partner-a-partner real) | Claves de API con alcance por organización, rotación y revocación, documentadas como contrato de integración. | Exploración |
| 36 | P3 | Webhooks salientes | H4 | Contratos de integración | Una organización necesita enterarse de un evento de la plataforma en su propio sistema, sin sondear. | Condicional (solo si hay un consumidor externo real esperando eventos) | Suscripción por organización a eventos de plataforma, con entrega firmada y reintentos — complemento saliente de las conexiones OAuth entrantes ya existentes. | Exploración |
| 37 | P3 | Modo mantenimiento / banner de plataforma | H2 | Gestión de entornos | Primera ventana de mantenimiento planeada que afecta a todas las organizaciones. | Condicional (solo si hace falta avisar de antemano, no solo detectar fallas como #8) | Banner de aviso a nivel plataforma, activable/desactivable por superadmin, visible en todo el panel. | Exploración |
| 38 | P3 | 2FA/MFA | H2 | Autogestión de contraseña | Primer requisito real de seguridad reforzada más allá de contraseña. | Condicional (solo si el producto o un cliente lo exige) | Segundo factor opcional u obligatorio por organización, sin romper el flujo de recuperación existente. | Exploración |
| 39 | P3 | Aceptación de términos/privacidad versionada | H2 | Autogestión de contraseña | Primera vez que el producto necesita rastrear qué versión de términos/privacidad aceptó cada usuario. | Condicional (solo si hace falta ese rastro, no todo producto lo necesita) | Registro de aceptación por usuario y versión de documento legal, con bloqueo fail-closed si hay una versión nueva sin aceptar. | Exploración |
| 40 | P1 | Rotación de secretos de larga vida | H2 | Blindaje de secretos en la orquestación (spec 014) | Primer secreto raíz (contraseña de DB, API key de proveedor) sin rotar desde su creación. | Condicional (solo si hay secretos de larga vida reales en producción) | Rotación programada o a demanda de credenciales raíz, distinta del acceso efímero que ya resuelve spec 014 — eso resuelve quién las ve, esto resuelve que no queden fijas para siempre. | Exploración |
| 41 | P2 | Cabeceras de seguridad HTTP | H2 | Gestión de entornos | Primer despliegue expuesto a tráfico público real. | Condicional (solo si hay exposición pública real) | CSP, HSTS, X-Frame-Options y afines configurados en el Refine servido, versionados como parte de `infra/refine/`. | Exploración |
| 42 | P3 | Canal de divulgación de vulnerabilidades | H2 | Ninguna | Primer cliente real con datos sensibles en producción. | Condicional (solo si hay datos sensibles reales expuestos) | `security.txt` o proceso documentado de reporte responsable, con tiempo de respuesta esperado. | Exploración |
| 43 | P1 | Backup de Storage (archivos) | H2 | Backups automáticos de Postgres (spec 011) | Primer archivo real en Storage sin respaldo cuando se construya #17. | Condicional (solo si el producto usa Storage para datos de negocio) | Respaldo automático de buckets de Storage, mismo patrón de verificación estructural que ya usa el backup de Postgres. | Exploración |
| 44 | P2 | Visibilidad de costos de infraestructura entre productos | H2 | Gestión de entornos | Más de un producto derivado corriendo en paralelo. | Condicional (solo si hay más de un producto real en producción) | Resumen de gasto de infraestructura (VPS, Supabase, IA) por producto derivado, para la agencia, no para el cliente final. | Exploración |
| 45 | P2 | Retención y eliminación de datos por política general | H2 | Multi-tenancy | Primera necesidad real de borrar datos de negocio por antigüedad o pedido, más allá de lo puntual que ya existe (interacciones IA, evidencia de workers). | Condicional (solo si hay una política de retención real que cumplir) | Mecanismo genérico de retención/purga configurable por tabla de producto, mismo patrón que ya usa `packages/ia`. | Exploración |
| 46 | P3 | Accesibilidad (WCAG) sin piso definido | H2 | Panel operable y extensible (Refine) | Primera pantalla nueva construida sin un nivel WCAG objetivo documentado. | Condicional (solo si el producto necesita cumplir un nivel de accesibilidad) | Nivel WCAG objetivo documentado en la constitución, con `accessibility-compliance`/`accessibility-testing` aplicadas de forma consistente. | Exploración |
| 47 | P3 | Documentación de API autogenerada (OpenAPI) | H4 | Contratos de integración (#11); Claves de API por organización (#35) | Primer cliente externo integrando contra claves de API reales. | Condicional (solo si hay integración partner-a-partner real) | Spec OpenAPI generada desde los contratos ya documentados, servida junto al panel. | Exploración |
| 48 | P3 | Trazas distribuidas entre Kestra/workers/Supabase | H2 | Monitoreo, alertas y errores (#8) | Primer fallo real que cruza varios servicios y cuesta reconstruir la secuencia. | Condicional (solo si hay fallos reales difíciles de rastrear entre servicios) | Identificador de correlación propagado entre Kestra, workers y Supabase, visible en el registro de errores de #8. | Exploración |
| 49 | P3 | Alertas de gasto inesperado en infraestructura | H2 | Visibilidad de costos de infraestructura entre productos (#44) | Primer gasto de infraestructura fuera de lo esperado. | Condicional (solo si hay riesgo real de gasto descontrolado, ej. uso de IA) | Umbral configurable con aviso cuando el gasto de un producto se desvía de lo esperado. | Exploración |

H1 = Convertir la base en derivable · H2 = Operar un producto con confianza ·
H3 = Capacidad AI-first segura · H4 = Capacidades activadas por demanda.

8 de los 49 ítems son **Inevitables**: en cuanto exista un primer producto
derivado y avance por su ciclo de vida normal (creado → desplegado → en
producción con datos reales), los va a cruzar sin importar a qué se dedique.
Los otros 41 son **Condicionales**: dependen de que ese producto elija
construir justo esa función (IA, documentos, integraciones, notificaciones,
un segundo producto, tráfico no confiable, volumen real, alta autoservicio,
portabilidad, branding, seguridad reforzada, rastro legal, secretos de
larga vida, exposición pública, un segundo producto en paralelo, retención
de datos, accesibilidad, gasto descontrolado) — pueden tardar mucho más o
no llegar a activarse nunca. Ninguna de las dos categorías necesita saber el dominio de antemano;
la diferencia es si la función en sí va a existir.

> **Horizonte 3 no se abre solo porque llegó su turno en la cola.** Empieza
> únicamente cuando exista una funcionalidad de IA concreta que lo dispare —
> no con un chatbot genérico. Si ese disparador no aparece, los ítems 5, 10,
> 11, 14, 16, 17 y 20 se saltan y la cola sigue por el siguiente ítem
> disponible (por ejemplo, el 12, 15, 18 o 19, que no dependen de IA).

## Límites explícitos

No se incorporan al template por sí mismos:

- Reglas, tablas, dashboards, prompts o flujos propios de un producto.
- Datos reales, secretos, proveedores configurados o destinos de alertas de un
producto.
- RAG, bases vectoriales, gRPC, microservicios o paquetes solo porque podrían
ser útiles en el futuro.
- Un chat genérico sin un trabajo concreto que resolver.

## Regla para priorizar una nueva capacidad

Antes de abrir una spec, responder:

1. ¿Qué problema real resuelve y para quién?
2. ¿Es reutilizable sin conocer el dominio de un producto?
3. ¿Qué producto o flujo concreto la activa ahora?
4. ¿Qué riesgo reduce o qué resultado medible habilita?
5. ¿Podemos resolverlo con lo que ya existe antes de agregar infraestructura?

Si no hay respuestas claras, la capacidad permanece en exploración.

## Indicadores de que la estrategia funciona

- Un producto derivado arranca con configuración propia sin copiar secretos ni
editar nombres manualmente en muchos archivos.
- Los cambios genéricos se pueden adoptar selectivamente sin bloquear al
producto.
- Los flujos críticos se prueban de punta a punta y los datos se pueden
recuperar.
- Una capacidad IA puede explicar qué datos usó, qué propuso, quién aprobó y
qué costo tuvo.

## Detalle de capacidades

Esta sección describe el alcance esperado de cada capacidad. El detalle ayuda
a convertir una capacidad elegida en una spec concreta, pero no reemplaza esa
spec.

### Horizonte 1 — Base derivable

#### Versión de origen

Debe registrar un tag o commit exacto del template al crear un producto. Esto
no requiere un servicio nuevo: puede ser un archivo de metadatos y una etiqueta
Git. Sirve para responder "¿de qué base nació este producto?" cuando haya que
evaluar una mejora posterior.

#### Adopción versionada de capacidades — implementada

El catálogo del template asigna una versión SemVer a cada capacidad
reutilizable. Cada producto mantiene su manifiesto de adopción independiente;
un chequeo diario compara versiones y abre seguimiento cuando hay trabajo
pendiente. La incorporación sigue siendo un PR selectivo y validado: no se
copian cambios ni se fusiona el historial divergente automáticamente. La
primera adopción está registrada en Sauger; falta su secreto de lectura para
confirmar el acceso remoto al catálogo privado. [Spec](../specs/20260924-233045-sincronizacion-capacidades/spec.md).

#### Gestión de entornos

Debe definir qué configuración pertenece a local, staging y producción; dónde
vive cada secreto; quién la carga; y cómo se valida antes de desplegar. El
template puede aportar `.env.example`, validadores y convenciones de nombres.

No debe guardar secretos ni intentar compartirlos entre productos. Cada
producto tiene sus propios proyectos Supabase, URLs, claves y destinos.

#### Contratos de integración

Debe definir una convención común para integraciones entre componentes: quién
llama a quién, cómo se autentica, qué payload acepta, qué respuesta devuelve,
qué errores puede producir y cómo se versiona. Puede empezar como contratos
Markdown y esquemas TypeScript/JSON, sin introducir gRPC ni un gateway nuevo.

Ejemplo: una Edge Function que dispara un flujo Kestra debe tener un contrato
que indique input, permisos requeridos, identificador de ejecución y errores
posibles.

### Horizonte 2 — Operación confiable

#### Backups y restauración

Debe definir qué se respalda, con qué frecuencia, durante cuánto tiempo y en
qué ubicación separada del entorno activo. Incluye Supabase y, cuando tengan
datos propios relevantes, las bases de metadatos de Kestra y Superset.

La restauración es parte de la capacidad: se debe poder recuperar un entorno
aislado desde una copia y comprobar integridad. Un backup no probado no cuenta
como recuperación disponible.

#### Monitoreo, alertas y errores

Debe distinguir tres cosas: salud de servicios (está vivo), errores técnicos
(por qué falló) y alertas operativas (quién debe enterarse). El template aporta
healthchecks, formato de eventos y una integración repetible; cada producto
elige sus destinos y umbrales.

Ejemplo: una caída de Kestra genera una alerta; un flujo fallido conserva su
log y un enlace a la ejecución; una excepción web queda agrupada en el registro
de errores del producto.

Parte entregada: la observabilidad de workers (eventos por etapa, logs y
capturas publicados en la ejecución de Kestra, retención limpia) ya cubre el
diagnóstico de un flujo fallido. Siguen pendientes healthchecks y el registro
central de errores. [Spec](../specs/20260925-133820-observabilidad-workers-navegador/spec.md).

#### Auditoría transversal

Debe producir eventos consistentes para acciones importantes que cruzan
componentes: actor, organización, acción, recurso afectado, resultado y fecha.
No pretende registrar cada lectura ni reemplazar los logs técnicos.

Ejemplo: una persona aprueba una acción propuesta por IA; el evento conserva
quién aprobó, qué ejecución aprobó y qué flujo se inició, sin guardar secretos
ni el contenido innecesario.

#### Notificaciones

Debe ofrecer una forma común de solicitar un aviso y conocer su resultado:
pendiente, enviado, fallido o reintentado. La interfaz no decide el mensaje de
negocio; ese contenido, el canal y el destinatario los define cada producto.

Puede comenzar con email y notificaciones dentro de la aplicación. WhatsApp,
Slack u otros proveedores solo se incorporan al existir un caso de uso y una
autorización para ellos.

#### Archivos y documentos

Debe extender el uso puntual de Storage hacia un patrón de archivos: propietario
u organización, tipo, tamaño, estado, permisos, retención y eliminación. Debe
mantener RLS y no exponer URLs públicas cuando el archivo sea privado.

No define "contratos", "facturas" o "actas"; cada producto agrega esos vínculos
de dominio sobre el mecanismo general.

#### E2E en CI

Debe convertir Playwright de infraestructura disponible a pruebas ejecutables
en CI. La base debe definir cómo levantar servicios, crear datos efímeros,
ejecutar el navegador, obtener evidencias y limpiar el entorno.
Los servicios que levante deben seguir el patrón del job `database`: stack
propio del CI derivado por repositorio y guarda contra stacks de desarrollo
([docs/deployment.md](./deployment.md), "Stack de Supabase propio del CI").

Cada producto escribe sus recorridos críticos. Por ejemplo, BNI probaría un
visitante y su seguimiento; el template no incluye ese escenario.

#### Seguridad continua

Debe automatizar controles repetibles antes de liberar cambios: dependencias
con vulnerabilidades conocidas, secretos commiteados, imágenes Docker
desactualizadas o configuración insegura. Los hallazgos deben ser visibles y
tener un criterio claro para bloquear o advertir.

No reemplaza la revisión de RLS, las pruebas ni el diseño de cada feature; los
complementa.

### Horizonte 3 — IA segura

#### Gateway IA

Debe ser el único punto desde el cual los productos llaman a modelos. Recibe
una solicitud autenticada, aplica límites y reglas, obtiene las credenciales
del servidor y devuelve o programa el resultado. Así las claves de proveedores
nunca llegan al navegador y se puede cambiar proveedor sin reescribir pantallas.

No implica un chatbot: puede atender una operación concreta, como resumir una
nota o extraer campos de un archivo.

#### Contexto y permisos IA

Debe derivar el usuario y la organización desde la sesión y los permisos
existentes, nunca desde valores enviados libremente por el navegador o el
prompt. Las herramientas de IA deben respetar el mismo aislamiento que RLS.

Ejemplo: una consulta sobre miembros solo puede recibir datos de la
organización efectiva de quien la inició.

#### Ejecuciones durables

Debe modelar tareas que no conviene mantener abiertas en HTTP: pendiente,
procesando, completada, fallida y cancelada cuando corresponda. Kestra coordina
el trabajo y workers ejecutan tareas especializadas si hicieran falta.

Ejemplo: analizar una hora de audio puede devolver un identificador de
ejecución; la interfaz muestra progreso y obtiene el resultado más tarde.

**Resuelto por composición, sin código nuevo (2026-10-03).** Se verificó que
los estados exactos que pide este ítem ya existen, repartidos en dos
capacidades ya implementadas: `durable-execution-outbox`
(`pendiente`/`reclamada`/`completada`/`agotada`/`cancelada`) y
`worker-execution-cycle` (`en_curso`/`exitosa`/`fallida`/`timeout`). Una
tarea de IA de larga duración se despacha como cualquier otra ejecución
durable — Kestra la reclama vía outbox, el worker corre, y la llamada real al
proveedor ocurre adentro de ese paso usando `governed-ai-core` (mismo patrón
ya demostrado por `ai-navigation-fallback`). Construir un mecanismo de
estados paralelo específico de IA sería duplicar lo que ya existe — mismo
criterio que ya se aplicó en "Creador de productos derivados" (resuelto como
guía, no como código). No hay spec de código para este ítem; si en el futuro
aparece una necesidad real que esta composición no cubra, se reabre con esa
necesidad concreta.

#### Herramientas IA

Debe registrar funciones explícitas que el modelo puede usar, con schema de
entrada, schema de salida, permisos y validación. El modelo no recibe acceso
directo a la base ni la capacidad de ejecutar SQL arbitrario.

Ejemplo: `listar_tareas_pendientes` puede devolver datos autorizados; una
herramienta para crear recordatorios puede requerir aprobación posterior.

#### Saneamiento de contenido no confiable para IA

Debe marcar explícitamente el contenido que el modelo recibe desde fuentes
externas no controladas por quien hace la consulta — texto scrapeado de un
sistema externo, un documento subido, un email, el resultado de una
herramienta — para que el modelo no lo trate como instrucciones propias.
Incluye delimitadores claros, una instrucción de sistema que ignore órdenes
incrustadas en ese contenido, y un registro de cuándo se activó esa defensa.

No reemplaza la validación de esquema de Herramientas IA ni la clasificación
de datos de Política de datos IA: ambas regulan qué sale hacia el proveedor;
esta capacidad regula qué entra y cómo se interpreta.

Ejemplo: un worker lee el estado de una factura en un sistema externo y lo
pasa al modelo; si ese texto contuviera una instrucción embebida ("ignora las
reglas anteriores y..."), el modelo debe seguir tratándola como dato, nunca
como una orden del usuario.

#### Aprobación humana

Debe separar una recomendación de una acción efectiva. La IA deja una propuesta
visible; una persona autorizada la aprueba, ajusta o rechaza; y recién entonces
se inicia la escritura o el flujo externo.

No hace falta para una respuesta meramente informativa. Sí para crear registros,
enviar mensajes, modificar datos o llamar servicios externos.

#### Trazas, costos y evaluaciones

Debe registrar modelo, versión de prompt, tiempo, costo estimado, fuentes y
herramientas usadas. También debe mantener casos de evaluación para comprobar
que un cambio de modelo o prompt no empeore comportamientos importantes.

No debe guardar por defecto datos sensibles completos en logs. La política de
retención y redacción forma parte del diseño de la feature.

#### Política de datos IA

Debe clasificar qué puede enviarse a un proveedor, qué requiere minimización o
anonimización y qué nunca puede salir del entorno. También debe definir cómo se
informa a usuarios y cómo se retienen solicitudes y resultados.

La política es genérica; cada producto puede endurecerla según su dominio o
regulación.

### Horizonte 4 — Bajo demanda

#### Búsqueda documental/RAG

Tiene sentido cuando un producto posee documentos y necesita responder usando
su contenido. Incluye ingesta, extracción de texto, indexación, búsqueda,
permisos y referencias a las fuentes. No se crea una base vectorial vacía ni se
indexan archivos sin una pregunta real que resolver.

#### UI de IA

El template puede proveer piezas visuales reutilizables: estado de generación,
progreso, fuentes, revisión de propuestas y botones de aprobación. Cada
producto define la conversación, las pantallas y el lenguaje propio de su
dominio.

#### Paquetes compartidos

Se crean cuando dos o más productos usan código estable con la misma interfaz.
El paquete debe tener versión, pruebas y compatibilidad explícita. Antes de
eso, una mejora puede viajar como commit seleccionado desde el template.

#### gRPC interno

Solo tiene sentido entre varios workers especializados que necesitan contratos
fuertes, streaming o volumen elevado. No se usa para el navegador, Supabase ni
Kestra sin un problema técnico que HTTP, colas o scripts no resuelvan.
