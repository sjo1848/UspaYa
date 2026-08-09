# PIN-004 — Fallback operativo para PIN perdido

Estado: propuesta para validar en Nivel B. No habilitar en producción ni en piloto cerrado hasta
que la validación humana confirme comprensión, carga operativa y ausencia de atajos inseguros.

## Regla de seguridad

El PIN nunca se recupera, regenera, revela ni reemplaza desde el cliente. Si el pedido está en
`ARRIVED` y el receptor no dispone del PIN, la entrega permanece abierta.

## Flujo propuesto

1. Cliente solicita ayuda desde el pedido en `ARRIVED`.
2. El sistema crea un caso de soporte idempotente asociado al pedido y a la entrega.
3. El caso queda en `PENDING_VERIFICATION`; el repartidor no puede completar.
4. Operaciones verifica, usando datos independientes del PIN:
   - pedido y comercio;
   - dirección de entrega;
   - teléfono parcialmente enmascarado;
   - identidad o relación del receptor con el pedido;
   - confirmación física del repartidor.
5. Operaciones registra una decisión explícita:
   - `REJECTED`: la entrega sigue abierta o se deriva a incidente;
   - `APPROVED`: se emite una autorización de cierre de un solo uso, con expiración e idempotencia.
6. El repartidor confirma la entrega usando esa autorización, receptor y efectivo exacto.
7. El backend registra la excepción y completa atómicamente entrega, pago y pedido.

## Límites obligatorios

- Nunca aceptar un PIN alternativo.
- Nunca permitir que el cliente autorice su propio cierre.
- Nunca permitir dos aprobaciones activas para la misma entrega.
- La autorización debe estar ligada a `deliveryId`, versión esperada, actor de Operaciones,
  expiración y una clave idempotente.
- Rechazo, expiración, reintento y cierre deben quedar en auditoría sin PIN ni secretos.
- Si la autorización ya fue usada, la repetición debe devolver el mismo resultado o un conflicto
  explícito, sin duplicar pago ni cierre.

## Contrato técnico pendiente de implementar

- `POST /support/delivery-cases`
- `GET /operations/delivery-cases`
- `POST /operations/delivery-cases/:caseId/approve`
- `POST /courier/deliveries/:deliveryId/confirm-fallback`

Los nombres son provisionales; Nivel B puede cambiar el flujo, los datos de verificación o la
decisión de fallback antes de congelar este contrato.
