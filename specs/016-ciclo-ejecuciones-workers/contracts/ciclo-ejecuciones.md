# Contract: Ciclo de Ejecuciones (Kestra ⇄ Supabase ⇄ Worker)

**Spec**: [spec.md](../spec.md) | **Data model**: [data-model.md](../data-model.md)

Contrato reutilizable (FR-010). Sin flows `.yml` nuevos de dominio (FR-012,
R6): cualquier flow existente lo invoca por JDBC con el rol
`kestra_orquestacion`. Orden de llamadas fijo:

1. iniciar → 2. ejecutar trabajo → 3. subir evidencia a Storage → 4. cerrar.

## iniciar_ejecucion_worker

```sql
select * from iniciar_ejecucion_worker(
  p_conexion_id := :conexion_id,       -- uuid, de datos_despacho_conexion
  p_clave_capacidad := :capacidad,     -- text, p. ej. 'extraer-reporte-x'
  p_origen := 'kestra',                -- 'manual' | 'programada' | 'kestra'
  p_actor := NULL,                     -- uuid solo si origen = 'manual'
  p_detalle := '{}'::jsonb             -- opcional, jsonb extensible, sin secretos (default '{}')
);
-- Éxito: una fila de ejecuciones_worker en estado 'en_curso' (columna id).
-- Errores contractuales (SQLSTATE + mensaje, nunca secreto):
--   CAPACIDAD_NO_HABILITADA  — capacidad deshabilitada/desconocida (FR-004).
--   CONEXION_CREDENCIAL_INVALIDA — conexión en credencial_invalida y el
--                              disparo no es manual de un administrador
--                              autenticado (bug conexion-invalida-trabada,
--                              FR-013 de la spec 013). Una conexión en
--                              error no bloquea.
--   YA_EN_CURSO              — hay una activa para esa organización+capacidad (US1, FR-002).
-- Nota: antes de insertar, cierra como 'timeout' las vencidas según
-- tiempo_max_seg (R2); ese cierre queda auditado y no es error.
-- p_detalle queda disponible en new.detalle para un trigger AFTER INSERT
-- sobre ejecuciones_worker que necesite datos de la corrida (ej. un rango
-- de fechas elegido en el disparo) desde el propio INSERT -- un UPDATE
-- posterior no reactiva ese trigger. cerrar_ejecucion_worker acepta su
-- propio p_detalle al cerrar; son campos independientes.
```

**Actualizado por la spec `disparo-programado-ciclo-ejecuciones`**: `p_origen = 'manual'` **y** `p_origen = 'programada'` generan una orden en `despachos_ejecucion` (antes de esa spec, solo `'manual'` la generaba). `'kestra'` sigue sin generarla — el flow que llama con ese origen ya va a ejecutar el trabajo en la misma corrida, insertar una orden ahí sería recursivo. Esto habilita un despachador programado genérico (`infra/kestra/flows/despachador-programado.yml`) que no conoce cómo ejecutar ninguna capacidad concreta: delega en el mismo outbox que ya consume `plantilla-generico.yml`/`plantilla-dedicado.yml`.

Variables que Kestra entrega al contenedor worker (patrón spec 013/014, R5):

```text
ORGANIZACION_ID, SISTEMA_EXTERNO, CONEXION_ID, CAPACIDAD, EJECUCION_ID
```

Nunca `CREDENCIAL`. El worker la obtiene dentro de su proceso con
`private.obtener_credencial_para_worker(CONEXION_ID)` como rol
`worker_<organizacion_id>` y la descarta al terminar.

## cerrar_ejecucion_worker

```sql
select * from cerrar_ejecucion_worker(
  p_ejecucion_id := :ejecucion_id,          -- uuid devuelto por iniciar
  p_estado_final := :estado,                -- SOLO 'exitosa' | 'fallida'
  p_motivo_sanitizado := :motivo,           -- text ya sanitizado (R4); ej. 'OK' | 'FALLA_TECNICA_SANITIZADA' | 'CREDENCIAL_INVALIDA:<conexion_id>'
  p_detalle := :detalle_json,               -- jsonb extensible, sin secretos (FR-009)
  p_archivo_path := :archivo_path,          -- ruta Storage o NULL
  p_evidencia_path := :evidencia_path       -- ruta Storage o NULL; SOLO si exitosa (FR-006)
);
-- Errores contractuales:
--   YA_CERRADA            — la ejecución ya estaba en estado final; sin cambios (FR-005, edge case doble cierre).
--   SECRETO_DETECTADO     — motivo/detalle con forma de credencial/sesión/token; nada se persiste.
--   NO_AUTORIZADO         — la ejecución no pertenece a la organización del rol llamante (FR-008).
```

## Convención del worker (extiende `workers/README.md`, FR-010)

- Señal de credencial inválida (único caso que imprime marca): stderr
  `CREDENCIAL_INVALIDA:<conexion_id>` y salida con error; el flow la clasifica
  sin persistir logs crudos (patrón `plantilla-generico.yml` + spec 014).
- Cualquier otra falla: motivo ya sanitizado en origen (literal + variantes
  URL/Base64 → `[REDACTED]`); el flow transmite la constante
  `FALLA_TECNICA_SANITIZADA`, nunca `errorLogs()`.
- Evidencia: subir primero a
  `evidencias-ejecuciones/<organizacion_id>/<capacidad>/<ejecucion_id>/...` y
  pasar las rutas a `cerrar_ejecucion_worker`; si la subida falla después del trabajo
  de negocio (edge case spec), cerrar como `fallida` con motivo sanitizado y
  sin rutas — el último éxito previo sigue intacto (FR-006).

## Refine (lectura)

- `GET` historial: lista paginada por `organizacion_id` + `capacidad`
  (admin/superadmin de la dueña, FR-007); `GET` detalle + `motivo_sanitizado`
  + duración (`finalizada_en - iniciada_en`).
- Evidencia: botón que pide URL firmada efímera al backend/Supabase y descarga;
  miembros sin permiso de auditoría y otras organizaciones reciben cero filas
  y cero URLs (SC-003).
