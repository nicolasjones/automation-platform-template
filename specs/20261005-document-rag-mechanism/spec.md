# Búsqueda documental genérica con IA (RAG)

## Qué resuelve

Un usuario de una organización sube documentos propios (cualquier tipo de
contenido textual relevante para su dominio) y puede preguntarles en
lenguaje natural, recibiendo respuestas basadas en el contenido real y
citando de qué documento provienen. Es la tercera capacidad de IA real de
negocio tipo "ya construida en un producto derivado, generalizada acá"
(junto al chat companion y el servidor MCP), con la misma gobernanza de
`packages/ia` (`governed-ai-core`) que las demás: proveedor/modelo
configurado solo por superadmin, política aprobada como gate humano
explícito, aislamiento estricto por organización.

A diferencia del chat companion y MCP, los documentos son contenido subido
directamente por el usuario, no datos de una funcionalidad conectada a un
sistema externo — por eso no aplica la distinción lectura/ejecución por
funcionalidad: es una funcionalidad más del panel con un único
habilitado/deshabilitado por organización.

## Origen

Ya construido y probado (pgTAP real, 16 aserciones) en un producto
derivado como la spec `rag-busqueda-documental` — portado y generalizado
acá siguiendo el proceso de `docs/wiki/portback-template.md` del producto
de origen: copiar el SQL/TypeScript ya escrito, no reimplementar desde
cero. Auditoría de código confirmó que el mecanismo del producto de origen
ya era ~100% genérico — ni el esquema ni las funciones conocían ningún
concepto de dominio del producto de origen.

## Requisitos funcionales

- **FR-001**: subir un documento crea su identidad lógica (`documentos`) y
  una primera versión en estado `procesando`.
- **FR-002**: indexar un documento (Edge Function `indexar-documento`)
  extrae texto (txt/pdf/docx), lo fragmenta, genera embeddings en batch
  (OpenAI — el único proveedor soportado para embeddings, ya que
  `invocarProveedorIa` no implementa ese endpoint) y activa la nueva
  versión solo si todos los fragmentos se indexaron con éxito.
- **FR-003**: nunca hay una ventana sin ninguna versión usable al
  actualizar un documento — la activación es atómica (reemplaza la
  versión activa anterior y activa la nueva en una sola transacción).
- **FR-004**: preguntar (Edge Function `preguntar-documentos`) embebe la
  pregunta, busca fragmentos relevantes solo de versiones activas y solo
  de la organización del usuario (RLS, nunca service-role), y genera una
  respuesta citando los documentos de origen.
- **FR-005**: sin fragmentos por encima del umbral de similitud, responde
  que no encontró información sin llamar al proveedor de generación.
- **FR-006**: eliminar un documento hace purga real (borra objetos de
  Storage de todas las versiones + cascada de versiones/fragmentos), no
  solo ocultamiento.
- **FR-007**: gobernado por `governed-ai-core` — sin una política
  aprobada para el código de consumidor `rag-busqueda-documental`, falla
  cerrado con un mensaje claro (nunca intenta adivinar una credencial).

## Fuera de alcance

- Generación de embeddings con proveedores distintos de OpenAI (el
  gateway genérico `invocarProveedorIa` no expone ese endpoint todavía).
- Búsqueda cruzando documentos de distintas organizaciones (explícitamente
  rechazado por RLS).

## Dependencias de plataforma

- `governed-ai-core` (packages/ia) — gobernanza de la invocación.
- Extensión `pgvector` — ya habilitada en este template desde
  `20260907011152_enable_pgvector.sql`, sin cambios nuevos de infra.
- Panel de funcionalidades (`features`/`tiene_feature`) — ya existente.
