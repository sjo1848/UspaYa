# UspaYa — Escenarios críticos de QA para pedidos

## Objetivo

Derivar pruebas de negocio, integración, concurrencia y recuperación a partir del ciclo de vida del pedido.

## 1. Creación y confirmación

- Doble toque en “Confirmar” genera un solo pedido.
- Reintento con la misma clave idempotente devuelve el mismo resultado.
- Misma clave con contenido diferente es rechazada.
- Pérdida de conexión después de confirmar permite recuperar el pedido creado.
- Comercio cerrado durante la revisión impide el envío.
- Cambio de precio exige nueva confirmación.
- Dirección fuera de zona impide seleccionar delivery.
- Carrito vencido no conserva una cotización inválida.

## 2. Pago

- Pago confirmado sin pedido genera conciliación o devolución, nunca pérdida silenciosa.
- Pedido creado con pago duplicado conserva un solo cobro válido.
- Comprobante informado no avanza como pago confirmado sin validación.
- Pago vence mientras llega la confirmación externa: se reconcilia una sola vez.
- Reembolso total y parcial registran referencia, importe y responsable.
- Efectivo entregado con diferencia abre incidencia y no cierra automáticamente.

## 3. Comercio

- Comercio acepta mientras el cliente cancela: solo una transición gana por versión.
- Aceptación duplicada no repite notificaciones ni efectos.
- Producto agotado genera propuesta, no modificación silenciosa.
- Comercio no puede marcar `READY` con una propuesta pendiente.
- Demora actualiza ETA y genera alerta según umbral.
- Tiempo de respuesta vencido ejecuta la política configurada.

## 4. Logística

- Dos repartidores intentan aceptar la misma entrega: uno solo obtiene la asignación.
- Asignación vencida libera al repartidor y devuelve el pedido a `READY`.
- Repartidor no puede retirar un pedido no preparado.
- Retiro sin conectividad se sincroniza después sin duplicar custodia.
- Entrega propia no utiliza estados exclusivos de UspaYa.
- Retiro por cliente registra receptor y evidencia mínima.

## 5. Entrega

- PIN incorrecto impide confirmar entrega.
- Cliente ausente activa protocolo de espera e incidencia.
- Dirección incorrecta no se resuelve marcando entregado.
- Pedido dañado o incompleto abre disputa con evidencia.
- Entrega registrada dos veces conserva un único evento.
- Operador intenta cancelar mientras el repartidor entrega: se resuelve por control de versión.

## 6. Cancelaciones

- Cancelación en `DRAFT` es inmediata.
- Cancelación en `PENDING_MERCHANT` libera pago y reservas.
- Cancelación en `PREPARING` requiere evaluación de costo.
- Pedido retirado no se cancela directamente; abre incidencia.
- Solicitud rechazada retorna exactamente al estado previo.
- Toda cancelación conserva motivo, actor, cargos y reembolso.

## 7. Fallos y recuperación

- Reinicio del servicio entre escritura y notificación no pierde la transición.
- Fallo de WhatsApp o push no revierte el pedido.
- Evento outbox procesado dos veces no duplica efectos.
- Pedido en `FAILED` vuelve al último estado seguro.
- Recuperación de pago no crea un segundo pedido.
- Reconciliación de entrega no genera un segundo cobro.

## 8. Seguridad y permisos

- Cliente no puede marcar preparación o entrega.
- Comercio no puede modificar un pedido congelado sin propuesta.
- Repartidor no puede cambiar productos ni totales.
- Operador puede intervenir, pero la acción queda auditada.
- Usuario no autorizado no accede a pedidos ajenos.
- Acciones sospechosas o repetidas disparan límites o revisión.

## 9. Auditoría

Para cada transición se verifica:

- estado anterior y nuevo;
- actor y rol;
- fecha;
- motivo;
- clave idempotente;
- versión;
- canal;
- evidencia asociada.

## 10. Niveles de prueba

### Unitarias

Reglas de transición, políticas, cálculos y permisos.

### Integración

Persistencia, pagos, outbox, notificaciones y conciliación.

### Contrato

Interfaces entre cliente, comercio, repartidor y API.

### End-to-end

Flujos completos de retiro, entrega propia y entrega UspaYa.

### Concurrencia

Aceptación/cancelación simultánea, asignación doble y confirmaciones repetidas.

### Resiliencia

Caídas, reintentos, latencia, pérdida de conexión y recuperación.

## Criterios mínimos antes de producción

- Todas las transiciones permitidas y prohibidas tienen prueba.
- Operaciones críticas tienen pruebas de idempotencia.
- Conflictos de versión están cubiertos.
- Recuperaciones no duplican dinero ni pedidos.
- Flujos principales funcionan con conectividad intermitente.
- Auditoría y permisos están verificados.