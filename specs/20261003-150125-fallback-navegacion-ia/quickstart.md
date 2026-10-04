# Quickstart: validar `@platform/ia-navegacion`

## Prerrequisitos

- `pnpm install` en la raíz del repo.
- `@platform/ia` ya construido (`pnpm --filter @platform/ia build`).

## Validar el paquete de forma aislada

```sh
pnpm --filter @platform/ia-navegacion test
pnpm --filter @platform/ia-navegacion build
```

## Escenario de validación 1 — recuperación exitosa (User Story 1 + 2)

1. Construir un `PasoRecuperable` fixture con una sola `AccionPermitida` (`click_en_elemento`) y un `Verificador` que resuelve `true`.
2. Construir una `PoliticaActiva` y `ContratoConsumidor` fixture válidos (sin tocar Vault ni proveedores reales — el `AdaptadorInvocacionIa.invocarProveedor` del test devuelve directamente la acción esperada, sin red).
3. Llamar `intentarRecuperarPaso(paso, politica, contrato, adaptadorFixture)`.
4. Esperado: `estado === 'recuperado'`, `checkpoint` igual al declarado, y que `adaptadorFixture.ejecutarAccion` se haya llamado exactamente una vez con la acción propuesta.

## Escenario de validación 2 — rechazo de verificador es terminal (User Story 3)

1. Mismo fixture que el escenario 1, pero el `Verificador` resuelve `false`.
2. Esperado: `estado === 'no_recuperable'`, `motivo === 'verificador_rechazado'`, y que `adaptadorFixture.ejecutarAccion` se haya llamado **una sola vez** (no hay segunda propuesta dentro de la misma llamada).

## Escenario de validación 3 — dominio fuera de contrato nunca se ejecuta (User Story 3)

1. Fixture donde el `adaptadorIa.invocarProveedor` devuelve una acción cuyo `objetivo` el consumidor mapea a un elemento de un dominio distinto al declarado en `paso.alcance.dominioPermitido`.
2. Esperado: `estado === 'no_recuperable'`, `motivo === 'dominio_no_autorizado'`, y `adaptadorFixture.ejecutarAccion` **nunca** se llama.

## Escenario de validación 4 — sin política activa

1. `PoliticaActiva` fixture con `estado !== 'aprobada'`.
2. Esperado: `estado === 'no_recuperable'`, `motivo === 'sin_politica_activa'`, sin invocar al proveedor ni ejecutar ninguna acción.

## Fuera de alcance de este quickstart

Un recorrido E2E contra un sitio real (Xubio, Colppy o cualquier otro) no corresponde a esta capacidad genérica — queda para la spec de producto que la adopte, fuera de este repo.
