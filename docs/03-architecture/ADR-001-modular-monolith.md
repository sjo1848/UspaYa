# ADR-001 — Monolito modular

**Estado:** ACCEPTED

## Decisión

Implementar UspaYa como una única aplicación desplegable con módulos explícitos y una base de datos compartida con propiedad lógica de datos.

Módulos previstos:

- identity;
- customer;
- merchant;
- catalog;
- ordering;
- payment;
- delivery;
- operations;
- notification;
- analytics;
- audit.

## Reglas

- un módulo no accede a entidades internas de otro;
- las referencias cruzadas usan identificadores y contratos públicos;
- la infraestructura no se filtra al dominio;
- las tablas tienen propietario conceptual;
- Notification y Analytics no modifican agregados operativos;
- Shared Kernel permanece mínimo;
- las dependencias se verifican en PR y mediante pruebas de arquitectura.

## Motivo

El proyecto tiene un desarrollador principal, presupuesto bajo y todavía no posee carga que justifique consistencia distribuida, múltiples despliegues o un broker.

## Alternativas rechazadas

- microservicios desde el inicio;
- monolito sin límites;
- núcleo serverless fragmentado.

## Revisión

Reconsiderar solo ante necesidad sostenida de escalado independiente, aislamiento regulatorio, equipo autónomo o fallos que deban contenerse por proceso.
