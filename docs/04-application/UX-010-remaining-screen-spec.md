# UX-010 — Especificación de pantallas restantes del prototipo

**Estado:** CERRADA — pantallas especificadas, prototipadas y trasladadas al frontend; evolución
posterior gestionada por el backlog de Etapa 5.

Este documento mantiene el trabajo verificable sin editar directamente un archivo `.pen` protegido.
La referencia visual versionada es `pantallas.pen`, complementada por el trabajo consolidado en
Pen.dev y la identidad `DS-001`.

## 1. Cliente — ARRIVED sin PIN

**Objetivo:** explicar que el repartidor llegó, proteger el cierre y dar una salida clara sin
inventar un PIN alternativo.

- Encabezado: comercio, pedido y estado `El repartidor llegó`.
- Estado principal: bloqueo visible con explicación breve.
- Acción primaria actual: ninguna; el cierre requiere PIN.
- Acción secundaria: `Solicitar ayuda`, deshabilitada hasta existir el caso de soporte real.
- Mensaje de seguridad: nunca mostrar, regenerar ni pedir un PIN alternativo.
- Estados: loading, offline, error de consulta y ayuda no disponible.

## 2. Soporte — verificación en curso

**Objetivo:** que Operaciones pueda revisar una excepción sin convertirla en un atajo.

- Identificación del pedido y entrega; teléfono enmascarado.
- Checklist independiente del PIN: comercio, dirección, receptor y confirmación del repartidor.
- Estados de caso: `PENDING_VERIFICATION`, `APPROVED`, `REJECTED`, `EXPIRED`.
- Acciones: `Aprobar excepción` y `Rechazar`, siempre con motivo.
- Regla: una aprobación activa por entrega, vencimiento visible y auditoría.
- Nunca mostrar el PIN ni permitir que el cliente o el repartidor aprueben.

## 3. Repartidor — fallback aprobado

**Objetivo:** permitir el cierre únicamente después de una autorización operativa vigente.

- Indicador destacado: `Excepción aprobada por Operaciones`.
- Mostrar pedido, receptor, efectivo esperado y vencimiento de la autorización.
- El botón de cierre sólo se habilita para la entrega asignada y autorización vigente.
- Reintento con la misma clave no duplica cobro, auditoría ni cierre.
- Si vence o ya fue usada: volver a estado bloqueado y pedir revisión.

## 4. Operaciones — revisión de fallback

**Objetivo:** concentrar autoridad, evidencia y decisión en una sola superficie.

- Cola separada de pedidos pendientes de cierre y casos de excepción.
- Filtros por estado, antigüedad y vencimiento.
- Resumen de evidencia antes de decidir; datos sensibles minimizados.
- Confirmación explícita antes de aprobar/rechazar.
- Auditoría visible después de cada decisión, sin secretos.

## Criterios visuales compartidos

- Una acción principal por estado.
- Color más texto e icono; nunca color solo.
- Ámbar para atención pendiente, rojo sólo para bloqueo/riesgo y teal para acción autorizada.
- Foco de teclado visible, controles de al menos 44 px y contraste verificable.
- Layout usable en móvil con información crítica antes de acciones secundarias.

## Criterio de paso a código

No implementar acciones nuevas hasta que el frame tenga estados normal, loading, error, offline,
rechazo y éxito definidos. La UI puede mostrar el bloqueo de fallback, pero no debe simular la
aprobación ni el cierre mientras el contrato backend no esté implementado y probado.
