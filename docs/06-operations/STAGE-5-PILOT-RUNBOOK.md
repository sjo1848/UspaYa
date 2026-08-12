# Etapa 5 — Runbook mínimo del piloto

**Estado:** plantilla operativa; completar responsables y evidencias antes de pedidos reales.

Este runbook no reemplaza autenticación, despliegue ni una política de soporte. Sirve para que cada
control tenga dueño, señal y evidencia verificable.

## Antes de abrir la operación

| Control                           | Evidencia requerida                                                                                   | Responsable    | Estado    |
| --------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------- | --------- |
| Autenticación real y roles        | [validación #56](./INTERNAL-AUTH-VALIDATION.md): login, refresh, logout, revocación y rechazo cruzado | Equipo técnico | Cerrado   |
| Front/API desplegados             | URL, commit, fecha y headers HTTPS                                                                    | Por definir    | Pendiente |
| Base de datos                     | migración desde vacío + backup restaurable                                                            | Por definir    | Pendiente |
| Observabilidad                    | dashboard, logs sanitizados y alertas probadas                                                        | Por definir    | Pendiente |
| Rollback                          | ejecución documentada en entorno controlado                                                           | Por definir    | Pendiente |
| Participantes y reemplazos        | lista de comercios, clientes, operaciones y repartidores                                              | Por definir    | Pendiente |
| Zona y capacidad                  | límites geográficos y máximo diario                                                                   | Por definir    | Pendiente |
| Soporte e incidentes              | canal, horarios, severidades y escalamiento                                                           | Por definir    | Pendiente |
| Pagos, cancelaciones y reembolsos | responsable y procedimiento por caso                                                                  | Por definir    | Pendiente |

## Simulaciones obligatorias

1. Pedido completo: envío, persistencia tras F5, comercio, asignación, retiro, tránsito, ARRIVED y
   cierre con PIN correcto.
2. PIN perdido: ARRIVED permanece abierto, se registra el caso, se verifica identidad y se decide
   rechazo o autorización según `PIN-004`.
3. Reintento de red: repetir una mutación con la misma clave idempotente no duplica estado, pago ni
   auditoría.
4. Recuperación: restaurar backup de prueba y ejecutar el procedimiento de rollback sin exponer
   secretos.

## Durante la operación

- No superar 10 pedidos reales por día hasta completar la revisión del piloto.
- Registrar inicio, fin, estado final, incidentes, soporte, fallback y diferencias de pago por pedido.
- Ante un error crítico, detener nuevos pedidos, conservar el `correlationId`, capturar el estado
  y escalar al responsable de guardia.
- No copiar PIN, credenciales, tokens ni datos completos de contacto en tickets o chats.

## Criterio de pausa

Pausar la operación ante acceso cruzado entre roles, duplicación de cobro/cierre, pérdida de
trazabilidad, exposición de PIN, restauración no verificable o cualquier pedido sin dueño operativo.

## Cierre diario

- Conciliar pedidos y pagos.
- Revisar auditoría de fallback y cambios de estado.
- Clasificar incidentes por severidad.
- Actualizar métricas y decidir si se mantiene, reduce o amplía el límite del día siguiente.
- Guardar evidencia en el registro canónico del piloto.
