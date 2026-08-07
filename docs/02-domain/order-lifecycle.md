# Ciclo canónico del pedido

## Regla de separación

`OrderStatus` no incluye estados de pago, entrega, incidencia ni salud técnica.

`DISPUTE` es un tipo de incidencia. `FAILED` pertenece al ciclo propietario o a `ProcessHealth`.

## OrderStatus

- `SUBMITTED`
- `PENDING_MERCHANT`
- `CHANGE_PROPOSED`
- `ACCEPTED`
- `PREPARING`
- `READY`
- `FULFILLED`
- `COMPLETED`
- `CANCELLATION_REQUESTED`
- `CANCELLED`
- `REJECTED`

Terminales: `COMPLETED`, `CANCELLED`, `REJECTED`.

## DeliveryStatus

- `REQUESTED`
- `PENDING_ASSIGNMENT`
- `OFFERED`
- `ASSIGNED`
- `READY_FOR_PICKUP`
- `PICKUP_IN_PROGRESS`
- `PICKED_UP`
- `ON_THE_WAY`
- `ARRIVED`
- `DELIVERED`
- `FAILED`
- `CANCELLED`

## PaymentStatus

- `PENDING`
- `REPORTED`
- `PROCESSING`
- `CONFIRMED`
- `FAILED`
- `CANCELLED`
- `REFUND_PENDING`
- `PARTIALLY_REFUNDED`
- `REFUNDED`
- `CHARGEBACK`

## PreparationPaymentGate

- `NONE`
- `PAYMENT_REPORTED`
- `PAYMENT_CONFIRMED`

## Modalidades

- `CUSTOMER_PICKUP`
- `MERCHANT_DELIVERY`
- `USPAYA_DELIVERY`

## Comandos principales

- `SubmitOrder`
- `AcceptOrder`
- `RejectOrder`
- `ProposeOrderChange`
- `AcceptOrderChange`
- `RejectOrderChange`
- `StartOrderPreparation`
- `MarkOrderReady`
- `RequestOrderCancellation`
- `CancelOrder`
- `MarkOrderFulfilled`
- `CompleteOrder`
- `AssignCourier`
- `StartPickup`
- `ConfirmPickup`
- `StartDelivery`
- `ReportCourierArrival`
- `ConfirmDelivery`

## Invariantes P0

- un comercio y una sucursal por pedido;
- snapshots al confirmar;
- transición autorizada desde el estado origen;
- versión vigente;
- idempotencia en mutaciones críticas;
- una asignación activa;
- retiro solo desde `READY`;
- custodia transferida una sola vez;
- entrega completada por el repartidor asignado;
- auditoría append-only de acciones privilegiadas.
