# Gate A — Decisiones operativas pendientes

Este documento debe completarse con personas y límites reales antes de autorizar pedidos. Los
campos no se infieren desde Git ni se sustituyen por “equipo técnico”.

| Decisión                 | Titular     | Reemplazo   | Evidencia/valor           | Estado     |
| ------------------------ | ----------- | ----------- | ------------------------- | ---------- |
| Responsable del piloto   | Por definir | Por definir | nombre y aceptación       | BLOQUEANTE |
| Operaciones de guardia   | Por definir | Por definir | canal y horario           | BLOQUEANTE |
| Soporte a participantes  | Por definir | Por definir | canal y SLA               | BLOQUEANTE |
| Pagos y conciliación     | Por definir | Por definir | procedimiento             | BLOQUEANTE |
| Cancelaciones/reembolsos | Por definir | Por definir | autoridad y procedimiento | BLOQUEANTE |
| Custodia de secretos     | Por definir | Por definir | almacén y acceso          | BLOQUEANTE |
| Infraestructura/rollback | Por definir | Por definir | acceso al entorno         | BLOQUEANTE |
| Comercio participante    | Por definir | Por definir | consentimiento            | BLOQUEANTE |
| Repartidor participante  | Por definir | Por definir | consentimiento            | BLOQUEANTE |
| Clientes autorizados     | Por definir | No aplica   | lista privada             | BLOQUEANTE |
| Zona                     | Por definir | No aplica   | límites verificables      | BLOQUEANTE |
| Días y horarios          | Por definir | No aplica   | ventana operativa         | BLOQUEANTE |
| Capacidad máxima         | Por definir | No aplica   | pedidos por día           | BLOQUEANTE |
| Hosting y dominio HTTPS  | Por definir | Por definir | URL y certificado         | BLOQUEANTE |

## Valores iniciales que requieren aceptación

- Máximo sugerido: 10 pedidos por día, según el runbook vigente.
- Pausa inmediata ante acceso cruzado, duplicación de cobro/cierre, pérdida de trazabilidad,
  exposición de PIN o restauración no verificable.
- Todo incidente crítico detiene pedidos nuevos hasta tener dueño y contención.
- Las listas de participantes, teléfonos y credenciales se mantienen fuera del repositorio.

## Criterio de cierre

A8, A9 y A10 sólo cambian a cerrados cuando este documento enlaza la aceptación nominal y Drive
refleja la misma información. Una plantilla completa técnicamente no equivale a una decisión humana.
