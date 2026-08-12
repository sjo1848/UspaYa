# Gate A — Checklist de preparación del piloto

**Estado:** ABIERTO — A1/A2 validados; preparación técnica y operativa pendiente.
**Última revisión:** 2026-08-11
**Fuente:** `REV-PR-053` de Drive y `STAGE-5-PRODUCT-IMPROVEMENTS.md`

Gate A no se aprueba por tener scripts o documentación. Cada control necesita una decisión,
un responsable y evidencia reproducible en un entorno controlado.

## Secuencia de cierre

| Orden | Control                           | Estado                        | Evidencia requerida                                                              |
| ----- | --------------------------------- | ----------------------------- | -------------------------------------------------------------------------------- |
| A1    | Contrato de identidad/JWT         | CERRADO                       | ADR-006 aceptado e implementación interna validada en #56                        |
| A2    | Adaptador de identidad productiva | CERRADO                       | login/refresh/logout, sesión PostgreSQL, permisos cruzados y CI de #56           |
| A3    | Deploy reproducible               | PREPARADO / FALTA ENTORNO     | imágenes/configuración versionadas y despliegue de web, API y worker             |
| A4    | Secretos y variables              | PREPARADO / FALTA CUSTODIO    | matriz por entorno, responsable y almacenamiento fuera de Git                    |
| A5    | Observabilidad                    | PARCIAL                       | logs/health/correlación listos; dashboard y alertas dependen del hosting         |
| A6    | Backup y restore                  | CERRADO LOCAL / FALTA ENTORNO | restore aislado verificado; falta repetirlo en el entorno elegido                |
| A7    | Rollback                          | MECANISMO VALIDADO            | falta probar compatibilidad entre dos revisiones containerizadas reales          |
| A8    | Soporte y excepciones             | PENDIENTE                     | responsables y procedimientos para incidentes, pagos, cancelaciones y reembolsos |
| A9    | Alcance operativo                 | PENDIENTE                     | participantes, reemplazos, zona, horarios, capacidad y canal de soporte          |
| A10   | Sincronización documental         | PENDIENTE                     | Drive refleja el estado real y enlaza la evidencia técnica/operativa             |

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

Completar #57, ejecutar imágenes y recuperación en un entorno controlado y asignar los responsables
externos de A4/A8/A9/A10 antes de autorizar el piloto.
