# Contrato CLI: `infra/superset/importar-dashboards.mjs`

## Invocación

```bash
node infra/superset/importar-dashboards.mjs --source <ruta-al-paquete.zip> --entorno staging|production
```

## Entradas

| Fuente | Nombre | Requerido | Descripción |
|---|---|---|---|
| `--source` | ruta a archivo | Sí | Paquete exportado de Superset (ZIP con el YAML del dashboard + datasets/bases que usa) |
| `--entorno` | `staging` \| `production` | Sí | Determina qué variables de entorno (`SUPERSET_URL`, `SUPERSET_USERNAME`, `SUPERSET_PASSWORD`) resuelve el GitHub Environment activo — igual patrón que `desplegar-flow.mjs` con Kestra |
| Variable de entorno | `SUPERSET_URL` | Sí | Base URL de la instancia de Superset de ese entorno |
| Variable de entorno | `SUPERSET_USERNAME` / `SUPERSET_PASSWORD` | Sí | Credenciales de una cuenta de servicio de Superset con permiso de import |

## Comportamiento

1. Valida que el archivo en `--source` exista y sea legible antes de autenticar contra Superset (falla rápido, mismo criterio que `desplegar-flow.mjs` con `readFile` del flow).
2. Autentica contra la API de Superset (login con usuario/password para obtener token de acceso, o Basic Auth si la versión de Superset en uso lo soporta sin ese paso — a confirmar durante implementación contra la versión real del `infra/superset/compose.yaml` del repo).
3. Envía el paquete al endpoint de import de dashboards de Superset (`POST /api/v1/dashboard/import/`, multipart con el ZIP).
4. Reporta el resultado (dashboard(s) importados) o el error de Superset, redactando credenciales del mensaje antes de propagarlo (mismo patrón `redactError`).

## Salida

- Éxito: código de salida 0, log con el/los dashboard(s) importados.
- Error: excepción con mensaje redactado, código de salida distinto de 0.

## Fuera de alcance de este contrato

- No se invoca desde ningún workflow automático de push (FR-011) — es invocación manual mientras no exista ningún paquete de dashboard versionado en el repositorio.
- No decide qué datasets/bases debe mapear el import a nivel de negocio — eso es trabajo del producto derivado cuando tenga su primer dashboard real, documentado como siguiente paso en `docs/adoptar-cicd-staging-produccion.md`.
