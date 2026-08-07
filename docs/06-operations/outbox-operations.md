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
SELECT id, "eventName", attempts, "availableAt", "lastError"
FROM "OutboxEvent"
WHERE status IN ('PENDING', 'FAILED')
  AND "availableAt" <= now()
ORDER BY "availableAt", "createdAt";
```

## Procesamiento

El worker reclama cada fila mediante una actualización condicional. El efecto local se registra en `OutboxConsumerReceipt`, cuya restricción única por consumidor y evento impide duplicados. Solo después se marca el evento como `PROCESSED`.

No se elimina el evento procesado en esta fase. Retención, purga y alertas pertenecen a una decisión operativa posterior.
