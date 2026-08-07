# Operación mínima de Outbox

## Backlog pendiente

```sql
SELECT status, count(*)
FROM "OutboxEvent"
GROUP BY status
ORDER BY status;
```

## Eventos demorados

```sql
SELECT id, "eventName", status, attempts, "availableAt", "lockedAt", "lastError"
FROM "OutboxEvent"
WHERE (
    status IN ('PENDING', 'FAILED')
    AND "availableAt" <= now()
  )
  OR (
    status = 'PROCESSING'
    AND "lockedAt" <= now() - interval '5 minutes'
  )
ORDER BY "availableAt", "createdAt";
```

## Procesamiento

El worker reclama cada fila mediante una actualización condicional. El efecto local se registra en `OutboxConsumerReceipt`, cuya restricción única por consumidor y evento impide duplicados. Solo después se marca el evento como `PROCESSED`.

Un evento que permanezca `PROCESSING` más allá del timeout se considera abandonado por una caída del worker. Otro ciclo puede reclamarlo si su `lockedAt` no cambió. El timeout predeterminado es de cinco minutos y puede configurarse al ejecutar el lote; debe ser mayor que la duración máxima prevista de un efecto.

La recuperación puede volver a intentar un efecto cuyo resultado externo haya sido incierto. En esta fase el consumidor solo registra un recibo local idempotente. Antes de conectar servicios externos, cada consumidor deberá definir su propia clave idempotente y semántica de confirmación.

No se elimina el evento procesado en esta fase. Retención, purga y alertas pertenecen a una decisión operativa posterior.
