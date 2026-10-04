# Implementation Plan: Identificadores externos únicos por organización y entidades pendientes

**Branch**: `identificadores-externos-por-organizacion` | **Date**: 2026-10-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/20261004-184915-identificadores-externos-por-organizacion/spec.md`

## Summary

Una migración corrige `clientes_identificadores_externos`: `organizacion_id`
propio con FK compuesta hacia `clientes (id, organizacion_id)`, unicidad por
organización, `cliente_id` opcional y `nombre_en_sistema`. Las funciones
existentes conservan su firma y resuelven conflictos dentro de la
organización; dos funciones nuevas permiten registrar pendientes (worker o
administrador) y devolver un vínculo a pendiente.

## Technical Context

**Language/Version**: SQL (Postgres 17)

**Primary Dependencies**: `private.organizacion_id()`, `private.es_administrador_de()`, `private.organizacion_del_rol_actual()`, rol `workers_orquestacion`

**Storage**: Postgres

**Testing**: pgTAP (`mapeo_identificadores_clientes.test.sql` actualizado)

**Target Platform**: Supabase local y Cloud

**Project Type**: base de datos

**Performance Goals**: búsquedas por la clave única (índice)

**Constraints**: migración no aditiva en la unicidad: reversión documentada (research.md)

**Scale/Scope**: 1 migración, 1 prueba

## Constitution Check

- **I. Aislamiento multi-tenant**: corrige un conflicto y una fuga entre organizaciones. OK.
- **III. Idempotentes**: registración idempotente y serializada. OK.
- **V. Simplicidad**: se corrige la tabla existente, sin tabla paralela. OK.
- **VII. Documentación**: contrato actualizado y guía de adopción. OK.
- **Regla de migraciones aditivas** (`CLAUDE.md`): la migración cambia una restricción y la nulabilidad de una columna creada en otra spec ya cerrada. No destruye columnas ni tablas; la reversión, con sus límites, queda en research.md.

## Delivery

| Producto | Archivo que cambia | Validación | Destino |
|---|---|---|---|
| supabase | `supabase/migrations/<version>_identificadores_externos_por_organizacion.sql` | pgTAP local y CI | Supabase Cloud (`migraciones-cloud`) |

## Project Structure

### Documentation (this feature)

```text
specs/20261004-184915-identificadores-externos-por-organizacion/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/identificadores-externos.md
└── tasks.md
```

### Source Code (repository root)

```text
supabase/migrations/<version>_identificadores_externos_por_organizacion.sql
supabase/tests/database/mapeo_identificadores_clientes.test.sql   # actualizado
template-capabilities.json                                        # mapeo-identificadores-externos 2.0.0, suma la migración
docs/schema.html                                                  # pnpm docs:schema
specs/20260930-135541-mapeo-identificadores-clientes/research.md  # nota: Decisión 2 revisada por esta spec
```

**Structure Decision**: sin UI. La pantalla de pendientes es de cada producto
(en el template no hay hoy un consumidor que descubra entidades). Skills al
implementar: `supabase-postgres-best-practices` y `authz-security` para la
revisión.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Cambio no aditivo de una restricción | el defecto es la propia restricción global | agregar una restricción nueva y dejar la global no corrige el conflicto entre organizaciones |
