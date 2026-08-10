# Gate A — Checklist de preparación del piloto

**Estado:** ABIERTO — primera vertical mergeada; preparación operativa pendiente.
**Última revisión:** 2026-08-10
**Fuente:** `REV-PR-053` de Drive y `STAGE-5-PRODUCT-IMPROVEMENTS.md`

Gate A no se aprueba por tener scripts o documentación. Cada control necesita una decisión,
un responsable y evidencia reproducible en un entorno controlado.

## Secuencia de cierre

| Orden | Control                           | Estado                       | Evidencia requerida                                                               |
| ----- | --------------------------------- | ---------------------------- | --------------------------------------------------------------------------------- |
| A1    | Contrato de identidad/JWT         | DECIDIDO / EN IMPLEMENTACIÓN | issuer interno, audience, claims mínimos y ADR-006 en `ACCEPTED`                  |
| A2    | Adaptador de identidad productiva | PENDIENTE                    | sesión real, validación JWT, mapeo `sub` → usuario interno y permisos cruzados    |
| A3    | Deploy reproducible               | PENDIENTE                    | imágenes/configuración versionadas y despliegue de web, API y worker              |
| A4    | Secretos y variables              | PENDIENTE                    | matriz por entorno, responsable y almacenamiento fuera de Git                     |
| A5    | Observabilidad                    | PENDIENTE                    | correlación, logs sanitizados, métricas, dashboard y alertas accionables          |
| A6    | Backup y restore                  | PREPARADO                    | ejecución sobre entorno controlado, restauración verificada y evidencia archivada |
| A7    | Rollback                          | PENDIENTE                    | despliegue de una versión anterior y comprobación de salud/compatibilidad         |
| A8    | Soporte y excepciones             | PENDIENTE                    | responsables y procedimientos para incidentes, pagos, cancelaciones y reembolsos  |
| A9    | Alcance operativo                 | PENDIENTE                    | participantes, reemplazos, zona, horarios, capacidad y canal de soporte           |
| A10   | Sincronización documental         | PENDIENTE                    | Drive refleja el estado real y enlaza la evidencia técnica/operativa              |

## Criterio de aprobación

Gate A sólo puede pasar a `APPROVED` cuando A1–A10 tengan evidencia o una contención explícita
aceptada por el responsable del piloto. La autorización comunicada del piloto no reemplaza estos
controles.

## Decisiones que requieren definición externa

- Rotación y custodia de claves del servicio.
- Personas responsables de soporte, operaciones, pagos y seguridad.
- Zona, horarios, participantes, reemplazos y límite diario.
- Entorno de despliegue y almacenamiento de secretos.

Hasta resolverlas, se puede avanzar con adaptadores, imágenes, runbooks y pruebas, pero no declarar
Gate A aprobado ni ejecutar pedidos reales.

## Próxima acción técnica

Implementar el módulo interno de identidad y completar A2 antes de desplegar cualquier build de
piloto.
