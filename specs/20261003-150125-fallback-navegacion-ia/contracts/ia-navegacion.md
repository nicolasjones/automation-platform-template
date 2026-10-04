# Contrato de `@platform/ia-navegacion`

Expone una única función pública para intentar recuperar un paso bloqueado:

```ts
async function intentarRecuperarPaso(
  paso: PasoRecuperable,
  politica: PoliticaActiva,          // de @platform/ia, ya resuelta por el consumidor
  contratoConsumidor: ContratoConsumidor, // de @platform/ia
  adaptadorIa: AdaptadorInvocacionIa,     // provisto por el consumidor; llama al proveedor real
  ahora?: () => Date,                     // SOLO pruebas: reloj inyectable para el presupuesto de tiempo; un consumidor real nunca lo pasa
): Promise<ResultadoInvocacion>
```

No expone nada más: ni acceso a Vault, ni a la configuración de proveedores, ni a la tabla de interacciones — todo eso sigue siendo responsabilidad exclusiva de `@platform/ia` y de quien la configura.

## Precondiciones que el consumidor garantiza antes de llamar

- `paso.alcance.dominioPermitido` es el dominio real de la página en la `Page`/`BrowserContext` activa — esta capa no lo verifica contra el navegador, solo lo usa para rechazar acciones propuestas que lo contradigan.
- `paso.accionesPermitidas` no está vacío (si lo está, el consumidor no debe llamar a esta función — Edge Case de la spec).
- `politica` y `contratoConsumidor` corresponden a una política activa real y vigente del consumidor en `@platform/ia`; esta capa los valida con `validarPoliticaActiva`/`validarPresupuesto` pero no los crea ni los administra.

## Garantías que ofrece

- Ninguna acción ejecutada pertenece a un objetivo fuera de `paso.alcance.dominioPermitido` ni a una variante fuera de `paso.accionesPermitidas` (FR-003, FR-004).
- Nunca reautentica ni abre una sesión nueva: todo ocurre a través del `adaptadorIa` que el consumidor ya conectó a su propia `Page`/`BrowserContext`.
- `estado: 'recuperado'` solo ocurre si `paso.verificador` devolvió `true`.
- `estado: 'no_recuperable'` incluye siempre un `motivo` tomado del conjunto cerrado documentado en `data-model.md`; nunca una segunda acción propuesta dentro de la misma llamada tras un rechazo de verificador.
- Los únicos eventos emitidos son los que ya produce `@platform/ia` (`EventoInteraccion`); esta función no escribe a Kestra, Supabase ni ningún almacenamiento propio.

## AdaptadorInvocacionIa (lo que el consumidor implementa)

```ts
type AdaptadorInvocacionIa = {
  invocarProveedor: (entradaSanitizada: Record<string, unknown>, perfilId: string) => Promise<unknown>
  resolverObjetivo: (objetivo: string) => { dominio: string } | null // permite validar el dominio ANTES de ejecutar
  ejecutarAccion: (accion: AccionPermitida) => Promise<void> // mapea `objetivo` a un Locator real y lo ejecuta
}
```

`resolverObjetivo` devuelve `null` si el consumidor no reconoce esa clave — en ese caso el mecanismo la trata igual que un dominio no autorizado (FR-004), nunca como "sin acciones permitidas".

Esta capa nunca llama directamente a un SDK de proveedor de IA ni a Playwright: delega ambos al adaptador del consumidor, igual que `@platform/ia` delega el transporte de proveedor a cada consumidor (ver su README, sección "Antes de adoptar", punto 4).
