# Quickstart: Estado, contacto y borrado restringido de clientes

## Base

1. `pnpm dev:supabase` y aplicar la migración (`supabase migration up --local`).
2. `supabase test db --local`: `clientes_ciclo_de_vida.test.sql` cubre:
   - estado inválido rechazado; baja y reactivación por `update`;
   - email inválido y largos rechazados; espacios → `null`;
   - `created_at` enviado por `authenticated` ignorado en alta; `created_at` inmutable en update; `updated_at` siempre de la base; `created_at` conservado como `postgres`;
   - `borrar_cliente` de un cliente sin referencias: lo borra;
   - con una fila en `clientes_identificadores_externos`: `P0001` con `detail = datos_asociados`;
   - con una tabla de prueba creada en la transacción con FK a `clientes`: también `P0001` (SC-003);
   - con `motivo_cliente_no_borrable_producto` redefinida en la transacción: `P0001` con ese motivo (SC-004);
   - miembro sin escritura → `42501`; cliente de otra organización → `P0002`.

## Pantalla

1. `pnpm dev:refine:host`, entrar como administrador.
2. Clientes: la lista muestra solo activos; el filtro "Inactivos" muestra los dados de baja.
3. Editar un cliente: cargar email, teléfono y observaciones; guardar y volver a abrir.
4. Un cliente recién creado ofrece "Borrar"; uno con un identificador externo vinculado ofrece solo "Dar de baja".
5. Como miembro sin escritura: los controles de estado y borrado no aparecen, y un `update` directo por la API falla por RLS.
