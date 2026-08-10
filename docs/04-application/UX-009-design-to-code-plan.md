# UX-009 — Plan de implementación del prototipo en frontend

**Estado:** CERRADO — handoff UX→frontend implementado y validado; mejoras posteriores pasan al
backlog de Etapa 5.

## Criterio crítico

`pantallas.pen` es la referencia visual versionada para el handoff; el prototipo consolidado en
Pen.dev no autoriza a maquillar estados que
el backend todavía no soporta. Cada pantalla debe conectarse a una proyección autoritativa, conservar
la continuidad tras F5 y mostrar carga, error, falta de conexión y permisos. El fallback de PIN se
presentará como bloqueo/ayuda hasta implementar su contrato seguro.

## Orden de implementación

1. **Shell y fundamentos:** marca de montaña, navegación contextual, tokens DS-001, tipografías de
   sistema, responsive, foco y estados semánticos.
2. **Cliente — pedido recuperado:** `CustomerActiveOrders` como pantalla principal, detalle de pedido
   y CTA de seguimiento; validar continuidad tras F5 y que el PIN no reaparezca.
3. **Cliente — ARRIVED sin PIN:** estado bloqueado, explicación clara y acceso a ayuda; sin prometer
   completar mientras el fallback backend no exista.
4. **Comercio, Operaciones y Repartidor:** trasladar jerarquía, tarjetas, estados y acciones de los
   frames respectivos sin cambiar las reglas de autorización.
5. **Fallback productivo:** recién después del contrato aprobado, conectar solicitud de ayuda,
   verificación operativa, autorización de un solo uso y cierre idempotente.
6. **Validación:** comparación visual contra `pantallas.pen`, viewport móvil/escritorio, teclado,
   contraste, recarga, errores de red y suite E2E.

## Definition of Done por pantalla

- Tiene correspondencia explícita con un frame de `pantallas.pen`.
- Usa tokens DS-001, no colores aislados.
- Tiene estado loading, empty, error, offline y autorización insuficiente cuando aplica.
- No expone PIN ni secretos en almacenamiento, logs o mensajes.
- Las acciones son reales o están marcadas como no disponibles.
- Tiene prueba de comportamiento y validación visual.

## Evidencia de cierre

- Prototipo consolidado y revisado en Pen.dev.
- Shell móvil y superficies Cliente, Comercio, Operaciones y Repartidor implementados.
- Identidad DS-001 y motion accesible aplicados al frontend.
- 24 tests unitarios del frontend, typecheck y build exitosos.
- 3 pruebas E2E móviles exitosas, incluido F5, recuperación sin PIN y cierre en `COMPLETED`.
- Commits de implementación: `a7b943c`, `8259d5e`, `0414fb2` y `af8dec9`.

Las capacidades productivas de autenticación, deploy, observabilidad y fallback de PIN quedan fuera
de este handoff y permanecen abiertas en la Etapa 5.

## Primer incremento

El primer incremento implementa el shell visual y deja visible la superficie de Cliente sin romper
la consola de desarrollo necesaria para probar los flujos actuales. La selección de actor queda
contenida como herramienta de desarrollo y no se presenta como autenticación productiva.
