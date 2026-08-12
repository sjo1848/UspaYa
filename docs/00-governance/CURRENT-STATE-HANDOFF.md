# UspaYa — estado actual para revisión externa

**Fecha:** 2026-08-11
**Etapa:** autenticación interna validada en #56; Etapa 5 abierta por Gate A.

## Logrado

- Primera vertical completa: Cliente → Comercio → Operaciones → Repartidor → `COMPLETED`.
- Persistencia y recuperación después de F5/cierre sin recuperar el PIN.
- Idempotencia, control de versiones, correlación, auditoría, Outbox y permisos por rol/scope.
- Frontend Vue/Vite con identidad DS-001, shell móvil, motion accesible y estados de recuperación.
- Prototipo Pen.dev consolidado para los cuatro roles y el escenario crítico de fallback.
- Backup PostgreSQL reproducible y restore protegido con confirmación explícita.

## Evidencia disponible

- 24 tests unitarios del frontend exitosos.
- Typecheck y build exitosos.
- 3 E2E Chromium móvil exitosos.
- El E2E cubre recarga, redescubrimiento sin PIN, frontera de privacidad del destino, reintento
  idempotente y cierre completo.
- Documentación de alcance, UX, motion, identidad productiva y runbook de piloto.
- Checklist de Gate A con estados y evidencia requerida.

## Abierto y fuera del cierre actual

- Proveedor OIDC externo sigue fuera de alcance; la autenticación interna JWT contra PostgreSQL
  quedó validada en [#56](../06-operations/INTERNAL-AUTH-VALIDATION.md) y lista para Gate A.
- Deploy reproducible de web, API y worker.
- Observabilidad operativa, alertas y evidencia HTTPS de hosting.
- Restore en entorno controlado y rollback probado.
- Decisión e implementación del fallback productivo del PIN.
- Responsables, participantes, zona, horarios, límites y soporte del piloto.
- Notificaciones, pagos integrados, cancelaciones, reembolsos y mejoras posteriores a la evidencia.

## Criterio para el análisis externo

La revisión debe distinguir entre:

1. capacidades implementadas y probadas localmente;
2. controles diseñados pero no ejecutados en un entorno de piloto;
3. decisiones todavía dependientes de proveedor, responsables o evidencia externa.

No debe considerarse el selector de actores de desarrollo como autenticación productiva ni el
prototipo de fallback como autorización real de entrega.

## Próximo orden recomendado

```text
#56 autenticación interna validada → Gate A → Gate B → simulaciones → Gate C/D → piloto cerrado → medición → backlog de Etapa 6
```

La nomenclatura vigente es la de `STAGE-5-PRODUCT-IMPROVEMENTS.md`: Gate B corresponde a PIN/fallback,
Gate C a identidad/experiencia y Gate D a evidencia. El issue histórico #47 puede referirse a PIN como
“Gate C”, pero esa etiqueta no debe usarse para decisiones nuevas.
