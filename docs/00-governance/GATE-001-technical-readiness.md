# GATE-001 — Puerta de preparación técnica

**Estado:** APPROVED FOR TECHNICAL FOUNDATION  
**Fecha:** 2026-08-06

## Decisión

UspaYa cuenta con definición suficiente para preparar el repositorio e implementar una primera vertical técnica controlada.

Esto no autoriza pedidos reales ni lanzamiento público.

## Resultado

- **READY FOR TECHNICAL FOUNDATION**
- **NOT READY FOR CLOSED PILOT**
- **NOT READY FOR PUBLIC RELEASE**

## P0/P1 revisados

- separación entre Pedido, Pago, Entrega, Incidencia y salud técnica;
- creación idempotente;
- concurrencia optimista;
- autorización por rol y alcance;
- una asignación logística activa;
- retiro solo desde `READY` y por el repartidor asignado;
- prueba de entrega y PIN;
- auditoría de intervenciones;
- resultado incierto ante mala conectividad;
- QA trazable a contratos y estados canónicos.

No se detectan contradicciones P0 activas entre las fuentes revisadas.

## Brechas no bloqueantes

Permanecen abiertas y no deben codificarse como reglas definitivas:

- gate de pago por comercio y método;
- ventana exacta de navegación;
- tarifa, comisión y compensación;
- vehículos, seguro y marco contractual;
- fallback definitivo del PIN;
- retornos y segundos intentos;
- reembolsos y autoridad nominal;
- cola offline completa;
- participantes, cobertura y horarios reales.

## Alcance autorizado

- estructura del monorepo;
- API, web, worker y PostgreSQL;
- migraciones y semillas;
- contratos HTTP y OpenAPI;
- auditoría, idempotencia y versión;
- Outbox mínimo;
- CI;
- primera vertical de `DEV-001`;
- pruebas P0 implementadas.

## Fuera de alcance

- pagos integrados;
- asignación automática;
- rutas optimizadas;
- múltiples entregas simultáneas;
- GPS continuo;
- operación offline completa;
- reembolsos automáticos;
- microservicios, broker externo o Kubernetes.

## Próxima puerta

Revisar cuando la primera vertical funcione de extremo a extremo, las migraciones sean reproducibles y los P0 seleccionados estén verdes.
