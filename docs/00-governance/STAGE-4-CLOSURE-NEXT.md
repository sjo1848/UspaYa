# Cierre de etapa y transición de UspaYa

Estado: CIERRE TÉCNICO COMPLETADO, PENDIENTE DE CONTROLES DE PILOTO
Fecha: 2026-08-09

## Etapa que se cierra

La primera vertical funcional y su hardening pre-piloto cubren Cliente, Comercio, Operaciones y
Repartidor, con persistencia transaccional, idempotencia, recuperación después de recarga, PIN no
recuperable, seguridad base y E2E browser.

## Criterios de cierre

- [x] Flujo principal probado localmente hasta `COMPLETED`.
- [x] Recuperación autoritativa después de F5/cierre sin recuperar el PIN.
- [x] Pruebas unitarias, integración, build, auditoría y seguridad base aprobadas localmente.
- [x] Prototipo de flujo crítico y baseline visual territorial definidos.
- [x] Corrección de feedback de cierre final subida al PR #50.
- [x] CI de Chromium verde después de la corrección.
- [x] `pantallas.pen` guardado en disco y verificado en el merge `a23c5b6`.
- [ ] Nivel B, autorización del piloto y decisión de fallback sincronizados en Drive.
- [ ] Autenticación, despliegue, observabilidad y rollback del piloto confirmados.

La autorización del piloto comunicada por el equipo no reemplaza la evidencia ni la sincronización
de los documentos canónicos. El piloto puede comenzar cuando esos controles estén registrados y
aceptados por sus responsables.

## Próxima etapa: mejoras naturales del producto

La siguiente etapa debe comenzar como un backlog priorizado por evidencia del piloto:

### Prioridad alta

- Implementar el fallback de PIN aprobado, si el piloto lo requiere dentro del producto.
- Autenticación productiva y permisos por actor.
- Notificaciones de cambios de estado y soporte contextual.
- Aplicar la identidad visual v1 al frontend mediante tokens CSS.
- Incidentes, cancelaciones, reembolsos y conciliación operativa.

### Prioridad media

- Catálogo, búsqueda, carrito, horarios e inventario.
- Disponibilidad y navegación del repartidor.
- Pagos digitales y comprobantes.
- Accesibilidad, performance y soporte para conectividad limitada.

### Evolución posterior

- Mapas y ETA.
- Favoritos, repetición de pedidos y promociones.
- Métricas operativas y analítica de producto.
- Expansión de zonas, comercios y modalidades.

Cada mejora debe entrar con issue, criterios de aceptación, impacto en dominio/UX/QA, decisión
registrada y validación proporcional, manteniendo el proceso de `PRE-DEV-002`.
