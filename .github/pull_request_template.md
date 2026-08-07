## Objetivo

<!-- Qué problema resuelve este PR. -->

## Alcance incluido

-

## Fuera de alcance

-

## Fuente de decisión

- [ ] GATE / ADR / DEV / DOM / APP / QA relacionado:
- [ ] No convierte una decisión provisional en invariante sin aprobación.

## Riesgos

- [ ] Dinero o conciliación
- [ ] Estado o concurrencia
- [ ] Custodia o entrega
- [ ] Seguridad o privacidad
- [ ] Conectividad o recuperación
- [ ] Ninguno de los anteriores

Detalle:

## Pruebas

- [ ] Unitarias
- [ ] Integración
- [ ] API
- [ ] E2E
- [ ] Regresión P0/P1

Comandos ejecutados:

```text

```

## Migraciones y datos

- [ ] No aplica
- [ ] Migración incluida y reversible
- [ ] Semillas actualizadas
- [ ] No contiene secretos ni datos personales reales

## Documentación afectada

-

## Checklist de arquitectura

- [ ] No hay acceso directo a infraestructura de otro módulo.
- [ ] El dominio no depende de NestJS, Prisma ni HTTP.
- [ ] Las mutaciones críticas validan actor, estado, versión e idempotencia.
- [ ] Los eventos y la auditoría no exponen datos sensibles.
- [ ] El alcance coincide con `DEV-001` o el cambio está justificado.
