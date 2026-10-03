# Adoptar capacidades del template

El archivo `template-capabilities.json` es el catálogo de contratos genéricos
que publica el template. Cada producto derivado conserva su propio
`template-adoption.json`, con la versión validada de cada capacidad.

## Reglas del catálogo

- Cada capacidad tiene un identificador estable, una versión SemVer, un título
  y las rutas de implementación que cubre.
- No se borran capacidades ya publicadas. Para retirar una, marcarla como
  obsoleta en el catálogo y mantener su historial.
- Si cambia una ruta cubierta, incrementar la versión de esa capacidad. El CI
  ejecuta `pnpm template:capabilities:check` para exigirlo.
- Un producto nuevo recibe el manifiesto vigente y ajusta `product` al nombre
  propio antes de empezar su dominio.
- Tras validar una adopción en el producto, actualizar su versión en el
  manifiesto. Si no corresponde al producto, marcar `not-applicable` con un
  motivo. Si se pospone, marcar `deferred` con un motivo; seguirá apareciendo
  como pendiente.

## Verificación

`pnpm template:adoption:check` compara identificadores y SemVer. No compara
commits: una capacidad integrada por reconciliación cuenta como adoptada aunque
su código tenga otro historial Git.

El workflow `Verificar adopción del template` del producto descarga sólo el
catálogo, usando un token Fine-grained de lectura, y abre o actualiza una issue
cuando detecta capacidades nuevas, desactualizadas o postergadas. Cuando el
manifiesto queda al día, cierra esa issue. No modifica archivos ni integra
cambios automáticamente.

Configurar `TEMPLATE_READ_TOKEN` como secreto Actions del producto. El token
debe limitarse a `Contents: Read-only` del repositorio del template. Si falta,
el workflow abre o actualiza una issue con instrucciones antes de marcar la
ejecución como fallida. El seguimiento se identifica por título y no requiere
etiquetas preconfiguradas en el producto. El nombre
del repositorio puede configurarse con la variable Actions `TEMPLATE_REPOSITORY`;
por defecto es `nicolasjones/automation-platform-template`.

Las issues abiertas sólo informan trabajo pendiente. Cada adopción se entrega
en un PR del producto con sus validaciones funcionales, migraciones aditivas y
reconciliaciones documentadas.
