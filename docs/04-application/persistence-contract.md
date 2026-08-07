# Contrato de persistencia transaccional

## Regla obligatoria

Los mapeadores y repositorios Prisma son primitivas de infraestructura. No constituyen casos de uso y no deben invocarse directamente desde controladores, guards, componentes web ni procesos externos.

Toda mutación expuesta debe ejecutarse desde un servicio de aplicación que confirme en una misma transacción:

1. validación de identidad, alcance, estado y versión;
2. cambio del agregado propietario;
3. persistencia optimista;
4. entrada append-only de auditoría cuando corresponda;
5. eventos de Outbox;
6. resultado idempotente de la operación.

Una notificación o consumidor posterior no participa en la transacción propietaria y no puede revertir un cambio ya confirmado.

## Implementación actual

`SubmitOrderService` implementa el contrato completo con aislamiento serializable. Los repositorios de Pedido y Entrega demuestran reconstrucción y control optimista, pero no son una vía autorizada para publicar mutaciones por sí solos.

Los casos de uso de Fase 3 deberán componer estos repositorios dentro de una unidad transaccional explícita. Un endpoint que persista estado sin auditoría y Outbox incumple este contrato aunque sus pruebas HTTP resulten verdes.

## Criterio de revisión

Antes de fusionar un caso de uso mutante debe existir una prueba de integración que demuestre rollback conjunto ante un fallo inyectado entre la persistencia del agregado y la creación de sus efectos transaccionales.
