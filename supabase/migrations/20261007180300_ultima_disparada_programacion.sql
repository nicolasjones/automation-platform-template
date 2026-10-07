-- Idempotencia del despachador programado (spec
-- disparo-programado-ciclo-ejecuciones, FR-002): sin esto, una
-- programación "diaria a las 06:00" se dispararía de nuevo en cada
-- corrida del despachador que caiga después de las 06:00 del mismo día
-- (ej. cron cada 10 minutos). Se agrega al diseñar el flow (T014), no
-- estaba en data-model.md original -- adición necesaria descubierta en
-- la implementación, documentada acá en vez de en el diseño retroactivo.
--
-- Migración aditiva. Reversión:
--   alter table programacion_ejecucion drop column ultima_disparada_en;

alter table programacion_ejecucion
  add column ultima_disparada_en timestamptz;

comment on column programacion_ejecucion.ultima_disparada_en is
  'Última vez que el despachador-programado llamó a iniciar_ejecucion_worker para esta programación. El despachador solo considera "debida" una fila si ultima_disparada_en es null o es de un día anterior a hoy -- garantiza como máximo un disparo por día, sin importar cada cuánto corra el Schedule.';
