# Etapa 5 — Operacionalización del piloto y mejoras naturales del producto

**Estado:** PLANIFICACIÓN CONSOLIDADA — implementación de producto pendiente de cerrar los gates
operativos del piloto.

## Horizonte de la etapa

La Etapa 5 tiene dos resultados y un orden explícito:

1. dejar UspaYa lista para un piloto cerrado, controlado y recuperable;
2. recoger evidencia del piloto;
3. priorizar las mejoras naturales según esa evidencia.

La primera parte es condición de entrada. La segunda no se reemplaza por opiniones aisladas ni por
un rediseño amplio previo a operar.

## Objetivo

Convertir el primer vertical funcional en un piloto controlado, medible y recuperable, y evolucionar la experiencia de UspaYa a partir de evidencia real. La etapa prioriza seguridad operativa, continuidad, soporte y claridad de uso antes de sumar crecimiento o complejidad.

La autorización del piloto fue acordada por el equipo. La documentación canónica de Drive todavía debe sincronizarse y los controles operativos deben quedar verificables antes de ejecutar pedidos reales.

## Alcance comprometido

### A. Preparación del piloto — P0

- autenticación productiva y autorización por rol y alcance;
- despliegue reproducible de web, API y worker;
- configuración segura de secretos y variables por entorno;
- backup, restore y rollback probados;
- observabilidad mínima con correlación, logs sanitizados, métricas y alertas;
- procedimiento para soporte, incidentes, pagos, cancelaciones y reembolsos;
- participantes, zona, horarios y capacidad máxima definidos;
- simulaciones obligatorias ejecutadas y archivadas.

### B. Escenario PIN perdido — P0

- decisión explícita entre procedimiento manual o flujo dentro del producto;
- ARRIVED siempre bloqueado hasta una autorización trazable;
- verificación independiente de identidad y evidencia;
- autorización de un solo uso, expirable, idempotente y auditable;
- nunca recuperar, reemplazar ni exponer el PIN.

### C. Experiencia consistente — P1

- identidad DS-001 aplicada a las cuatro superficies de rol;
- responsive, foco, contraste y estados de carga/error/offline;
- ayuda contextual y mensajes de estado sin secretos;
- validación visual contra `pantallas.pen`.

### D. Evaluación del piloto — P1

- finalización de pedidos y fallos por estado;
- tiempos de comercio, asignación, retiro y entrega;
- incidentes, soporte y uso del fallback;
- diferencias de pago y cierres pendientes;
- feedback estructurado de participantes.

## Criterios de salida

La etapa no se considera cerrada hasta que:

- los Gates A y B estén aprobados con evidencia;
- el piloto cerrado se haya ejecutado dentro de sus límites;
- no existan incidentes críticos abiertos sin dueño;
- backup/restore y rollback hayan sido probados;
- las simulaciones obligatorias del runbook tengan evidencia reproducible;
- se haya producido un informe de resultados y un backlog de Etapa 6;
- cada mejora del backlog tenga hipótesis, impacto, criterio de aceptación y prueba asociada.

## Ciclo de evaluación de mejoras

Cada propuesta futura se clasifica con esta secuencia:

```text
Evidencia → hipótesis → impacto en dominio/API/UX/QA → decisión → implementación pequeña
→ validación → medición → mantener, ajustar o descartar
```

Una mejora no entra por ser popular o visualmente atractiva: debe resolver una evidencia del piloto,
reducir un riesgo operativo o habilitar una capacidad comprometida.

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

#### ST5-009 — Motion y pulido de interacción

**Aceptación:** existe un sistema de duraciones/easing; loading, alertas y timeline tienen feedback
comprensible; `prefers-reduced-motion` está cubierto; las transiciones no ocultan estados de API ni
exponen secretos; la revisión visual móvil no muestra layout shifts relevantes.

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
