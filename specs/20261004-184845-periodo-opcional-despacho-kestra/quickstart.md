# Quickstart: Despachador por outbox con detalle opcional en Kestra

## Verificaciones estáticas

```bash
pnpm test:kestra:flows
```

Casos inyectados (los cubre el test, se pueden reproducir a mano en una rama
descartable):

- un input `defaults: ""` con `required: false` → falla;
- `{{ fromJson(taskrun.value).detalle.campo }}` sin `??` → falla;
- `{{ envs.variable_inexistente }}` en un flow → falla, y
  `pnpm kestra:deploy-flow <flow>` se niega antes de llamar a la API.

## E2E local

1. `pnpm dev:supabase`, `pnpm dev:kestra` (si se sumó una variable en
   `compose.yaml`, recrear el contenedor: `docker compose -f
   infra/kestra/compose.yaml up -d --force-recreate kestra`).
2. Publicar `despacho-capacidad` y después `despacho-outbox` con
   `pnpm kestra:deploy-flow`.
3. Iniciar dos ejecuciones manuales de la capacidad de ejemplo con
   `public.iniciar_ejecucion_worker`: una con `p_detalle => '{}'` y otra con
   un campo opcional cargado.
4. En el minuto siguiente, las dos órdenes pasan a confirmadas en
   `public.despachos_ejecucion` y el subflow recibe el campo vacío en la
   primera y con valor en la segunda.
5. Una ejecución con una `clave_capacidad` sin `case` termina liberada con
   `CAPACIDAD_SIN_FLOW` (y agotada al llegar al límite de intentos).
