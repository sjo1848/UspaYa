# Escenarios críticos de QA — primera vertical

## P0

### Pedido

1. Crear pedido válido congela snapshots y registra auditoría.
2. Dos solicitudes con misma clave y contenido devuelven el mismo pedido.
3. Misma clave con contenido distinto produce conflicto.
4. Solo el comercio de la sucursal puede aceptar.
5. Aceptación concurrente produce una única transición.
6. Preparar o marcar listo desde estado incorrecto falla.

### Entrega

7. Dos asignaciones concurrentes dejan una sola activa.
8. Repartidor no asignado no puede retirar.
9. Retiro antes de `READY` falla.
10. Retiro duplicado no transfiere custodia dos veces.
11. PIN incorrecto no completa entrega.
12. Entrega duplicada no duplica cobro, evento ni transición.
13. Entrega por actor ajeno es denegada.

### Infraestructura y seguridad

14. Mutación y Outbox se confirman o revierten juntas.
15. Reprocesar evento no duplica efectos.
16. Versión desactualizada devuelve conflicto y estado actual.
17. Pedido ajeno no filtra datos.
18. Toda intervención conserva actor, estado anterior, nuevo, motivo y correlación.

## Cobertura HTTP implementada hasta Fase 3.4

- P0 7: asignación manual protegida por restricciones de base y pruebas de API;
- P0 8: un repartidor distinto recibe `404 DELIVERY_NOT_FOUND` al consultar o mutar;
- P0 9: `start-pickup` vuelve a verificar que el Pedido continúe `READY`;
- P0 10: retries de inicio y confirmación devuelven `changed: false` sin duplicar auditoría ni Outbox;
- P0 14: retiro, evidencia de custodia, auditoría y evento se confirman dentro de una transacción serializable;
- P0 16: versión desactualizada no modifica la Entrega.

La confirmación de retiro registra responsable de comercio y cantidad de bultos como evidencia estructurada en auditoría append-only y en el evento de dominio. La asignación permanece activa para el tramo posterior de traslado y entrega.

## Niveles

- unitarias: transiciones, políticas y permisos;
- integración: persistencia, transacciones, versión, Outbox y asignación;
- API: DTO, errores, alcance e idempotencia;
- E2E: recorrido completo y fallos críticos.

## Regla de merge

Un P0 implementado no puede quedar sin prueba reproducible. Todo defecto P0 descubierto debe producir una prueba de regresión antes de cerrar el issue.
