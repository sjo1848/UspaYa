# Etapa 5 — Operacionalización del piloto y mejoras naturales del producto

**Estado:** PLANIFICADA — no iniciar implementación hasta cerrar los gates de piloto.

## Objetivo

Convertir el primer vertical funcional en un piloto controlado, medible y recuperable, y evolucionar la experiencia de UspaYa a partir de evidencia real. La etapa prioriza seguridad operativa, continuidad, soporte y claridad de uso antes de sumar crecimiento o complejidad.

La autorización del piloto fue acordada por el equipo. La documentación canónica de Drive todavía debe sincronizarse y los controles operativos deben quedar verificables antes de ejecutar pedidos reales.

## Fuera de alcance inicial

- Lanzamiento público o expansión de zona.
- Rediseño amplio sin hipótesis y criterio de evaluación.
- Mapas avanzados, fidelización, promociones o recomendaciones antes de contar con evidencia del piloto.
- Reemplazar los controles de piloto por un selector de actores de desarrollo.

## Gates de la etapa

### Gate A — Piloto operable y recuperable (P0)

Debe existir autenticación real con roles y alcance, despliegue controlado, observabilidad mínima, backups y rollback probados, y responsables explícitos para soporte, incidentes, cancelaciones, reembolsos, pagos, zona y participantes. Los documentos canónicos de Drive deben reflejar el estado real.

### Gate B — PIN perdido y fallback (P0)

Debe quedar decidida y documentada la modalidad de fallback: procedimiento manual operado por soporte/operaciones o flujo dentro del producto. En ambos casos, ARRIVED no puede cerrarse sin una autorización trazable; el repartidor no puede autoautorizarse; no se debe volver a mostrar el PIN después de recargar; y la resolución debe ser idempotente, expirable y auditable.

### Gate C — Identidad y experiencia consistente (P1)

La identidad DS-001 debe llegar al frontend mediante tokens reutilizables y verificarse contra `pantallas.pen`: cordillera teal, Sol Andino, Noche Andina, tipografías definidas, marca de montaña, contraste y estados accesibles.

### Gate D — Evidencia para priorizar (P1)

El piloto debe producir métricas y feedback suficientes para decidir qué mejorar: finalización de pedidos, fallos por estado, tiempos operativos, uso del fallback, incidentes, soporte y defectos críticos.

## Backlog priorizado

### P0 — Condiciones para operar

#### ST5-001 — Autenticación y alcance por actor

**Aceptación:** los actores ingresan con autenticación real; cada rol sólo puede acceder a sus operaciones; el selector de actores de desarrollo no aparece en el piloto; una solicitud sin permisos es rechazada y queda registrada sin filtrar secretos.

#### ST5-002 — Observabilidad, backup y recuperación

**Aceptación:** los flujos críticos tienen correlación de pedido, logs sanitizados y alertas accionables; existe un dashboard mínimo; backup y rollback se ejecutan en un entorno controlado; el runbook identifica responsable, señal, decisión y tiempo objetivo.

#### ST5-003 — Fallback de PIN en ARRIVED

**Aceptación:** la decisión manual o de producto está documentada; ARRIVED permanece abierto hasta la autorización; operaciones/soporte puede verificar identidad y autorizar una única vez; el repartidor no puede completar por su cuenta; la autorización vence, es idempotente y queda auditada sin almacenar ni revelar el PIN.

#### ST5-004 — Preparación operativa del piloto

**Aceptación:** están definidos participantes y reemplazos, zona, horarios, máximo diario, costos/tarifas, modalidad de pago, soporte, incidentes, cancelaciones y reembolsos; se ejecutan simulaciones antes del primer pedido real.

### P1 — Experiencia y soporte

#### ST5-005 — Despliegue de identidad visual

**Aceptación:** los tokens DS-001 se usan desde CSS/componentes; las cinco pantallas de `pantallas.pen` tienen correspondencia en frontend; se verifican responsive, foco, contraste, estados de carga/error y textos de fallback.

#### ST5-006 — Notificaciones y ayuda contextual

**Aceptación:** cliente, comercio, operaciones y repartidor reciben el estado relevante; el cliente puede contactar soporte desde un pedido; ningún mensaje expone PIN ni datos innecesarios; los reintentos no duplican notificaciones críticas.

#### ST5-007 — Usabilidad del pedido

**Aceptación:** catálogo, búsqueda, carrito, horarios e inventario comunican claramente disponibilidad, errores y siguiente acción; la continuidad tras F5 y cierre/reapertura queda cubierta por pruebas de navegador.

#### ST5-008 — Pagos e incidentes operativos

**Aceptación:** cada pedido tiene estado de pago y conciliación verificables; los casos de cobro fallido, cancelación, reembolso y disputa tienen dueño, estado visible y registro de auditoría.

### P2 — Mejoras naturales posteriores a la evidencia

- Mapas, ETA y ubicación con precisión adecuada a la zona.
- Favoritos, repetir pedido, promociones y fidelización.
- Analítica de cohortes, calidad de servicio y expansión gradual de zona.

## Forma de trabajo

Cada incremento debe tener issue, alcance, criterios de aceptación, impacto en dominio/API/UX/QA, decisión documentada, prueba reproducible y CI verde. Se trabaja por verticales pequeños, con revisión crítica de seguridad y operación; no se agrega alcance por intuición. La evidencia del piloto puede reordenar P1 y P2, pero no saltear los gates P0.

## Definition of Done de la planificación

- Backlog ordenado por riesgo y valor.
- Gates de piloto explícitos y verificables.
- Contrato de fallback alineado con el escenario de PIN perdido.
- Identidad DS-001 conectada con el trabajo de UX/UI.
- Primer incremento listo para convertirse en issue de implementación.

## Próximo orden de ejecución

1. Cerrar Gate A y sincronizar Drive con el estado real.
2. Cerrar la decisión de Gate B y convertirla en procedimiento o implementación testeada.
3. Preparar el piloto controlado y correr las simulaciones obligatorias.
4. Aplicar DS-001 al frontend y validar las pantallas críticas.
5. Ejecutar el piloto, medir, revisar incidentes y reordenar P1/P2 con evidencia.
