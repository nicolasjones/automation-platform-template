# Quickstart

```sh
pnpm --filter @platform/ia test
```

Escenarios nuevos:

- `marcarContenidoNoConfiable`: dos llamadas con el mismo texto producen envoltorios con nonces distintos; el texto original queda intacto adentro del delimitador.
- `clavesActivadas`: devuelve solo las claves declaradas que están presentes como string en la entrada; vacío si no se declaró ninguna o ninguna está presente.
- `prepararInvocacion` con `clavesNoConfiables` declaradas: el valor de esa clave en el resultado queda envuelto; una clave no declarada queda igual.
- `prepararInvocacion` con una clave no confiable de valor no-string (objeto/número/booleano/null): queda sin modificar (Edge Case, FR-004).
- `prepararInvocacion` sin `clavesNoConfiables` en el contrato: resultado idéntico al comportamiento actual (FR-006).

## Validación de regresión

- `pnpm test:ia` (incluye `packages/ia-navegacion`, debe seguir en 17/17 sin tocar su código).
- `pnpm build` / `pnpm lint`.
