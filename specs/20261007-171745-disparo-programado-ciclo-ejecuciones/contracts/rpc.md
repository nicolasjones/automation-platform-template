# Contrato: RPCs de programación del ciclo de ejecuciones

`security definer`. Escritura exige `private.es_administrador_de(organizacion_id)` (Clarifications).

| RPC | Firma | Notas |
|---|---|---|
| `public.programar_capacidad_ejecucion` | `(p_capacidad_id uuid, p_frecuencia text, p_dia_semana smallint default null, p_dia_mes smallint default null, p_hora time, p_desde date, p_hasta date default null)` | Upsert en `programacion_ejecucion` (`unique (capacidad_id)`). Rechaza si `capacidad_id` no pertenece a la organización del rol actual. |
| `public.quitar_programacion_capacidad` | `(p_capacidad_id uuid)` | Delete de la fila. |
| `public.listar_programaciones_de_organizacion` | — (lee `private.organizacion_del_rol_actual()`) | Devuelve cada programación con su capacidad, incluido si está vencida (`hasta < hoy`, de solo lectura, sin columna de estado nueva). |

## Dependencia interna (misma spec, no externa)

El flow despachador y `private.conexion_en_curso` no se expone como RPC pública — los consume Kestra con el rol `kestra_orquestacion`, igual que el resto del ciclo de ejecuciones (`private.ejecucion_worker_en_curso`, `private.resolver_resultado_despacho`).

## Contrato existente que esta spec actualiza (no reemplaza)

`specs/016-ciclo-ejecuciones-workers/contracts/ciclo-ejecuciones.md` — la tabla de orígenes de `iniciar_ejecucion_worker` pasa a documentar que `'programada'` también genera una orden en `despachos_ejecucion` (antes solo `'manual'`); `'kestra'` no cambia.
