# Contrato: marcado de contenido no confiable

No hay RPC ni endpoint — funciones puras de `@platform/ia`.

## Uso esperado

```ts
const contrato: ContratoConsumidor = {
  ...resto,
  datosPermitidos: ['instruccionPropia', 'textoVisiblePagina'],
  clavesNoConfiables: ['textoVisiblePagina'], // viene de un sitio externo, no de quien hace la consulta
}

const entrada = prepararInvocacion(contrato, politica, entradaCruda, intentos, iniciadoEn)
// entrada.textoVisiblePagina ya viene envuelto con el delimitador de nonce;
// entrada.instruccionPropia queda igual que antes.

// Si el consumidor quiere auditar si se activó el marcado:
const marcadas = clavesActivadas(contrato, entradaCruda)
if (marcadas.length > 0) {
  // incluir en detalle_sanitizado al registrar el evento, por ejemplo
}
```

Un consumidor que no declara `clavesNoConfiables` no ve ningún cambio (FR-006) — `ai-navigation-fallback` sigue sin declarar nada en esta spec; adoptarlo es una decisión de producto separada.
