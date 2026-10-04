# Contrato: máquina de estados extendida

```text
iniciada → preparando → invocando → respuesta_validada
                                          ├─ (sin aprobación requerida) → completada
                                          └─ (aprobación requerida)     → esperando_aprobacion
                                                                              ├─ aprobarInteraccion  → completada
                                                                              └─ rechazarInteraccion → rechazada
```

El resto de las transiciones (`registrarFallo` → `rechazada`/`revision_humana`/reintento con fallback) no cambia — `esperando_aprobacion` solo se alcanza desde `completarInteraccion` cuando el consumidor lo pide explícitamente.

## Compatibilidad

Un consumidor que llama `completarInteraccion(interaccion)` sin segundo argumento (como `ai-navigation-fallback` hoy) sigue yendo directo a `completada` — cero cambio de comportamiento.
