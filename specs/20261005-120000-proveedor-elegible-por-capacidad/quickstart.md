# Quickstart: Proveedor elegible por capacidad

1. Aplicar la migración en el stack local y `pnpm test:db` (pgTAP).
2. Un producto derivado carga su catálogo por migración propia, por
   ejemplo:
   ```sql
   insert into capacidades_proveedores (capacidad, proveedor, nombre_visible, clave_ejecucion, es_default, requiere_conexion_organizacion, envia_credencial_a_tercero, activo)
   values
     ('mi-capacidad', 'proveedor-propio', 'Automatización propia', 'clave_a', true, null, false, true),
     ('mi-capacidad', 'proveedor-externo', 'Proveedor externo', 'clave_b', false, 'sistema-externo', true, true);
   ```
3. Como administrador: `select proveedores_capacidad_de_organizacion();` →
   la capacidad nueva, proveedor propio, origen `catalogo`.
4. `select elegir_proveedor_capacidad_organizacion('mi-capacidad', 'proveedor-externo')`
   sin conexión → `PROVEEDOR_SIN_CONEXION`; con conexión y sin aceptar →
   `ACEPTACION_REQUERIDA`; con `true` → ok.
5. Excepción para un cliente con `elegir_proveedor_capacidad_cliente`;
   verificar `proveedores_efectivos_de_cliente` para ese cliente (origen
   `cliente`) y para otro (origen `organizacion`).
6. Invalidar la conexión del sistema externo → la resolución informa
   `disponible = false`, `CONEXION_INVALIDA`, el proveedor nominal no
   cambia.
7. `update capacidades_proveedores set activo = false where ...` sobre el
   proveedor externo → las elecciones que lo usaban desaparecen, queda un
   evento con `actor` nulo, y la resolución cae sola al proveedor propio.
