# UX-008 — Revisión de prototipo y baseline de interfaz

Estado: CERRADO PARA LA VERSIÓN DE PILOTO
Fecha: 2026-08-08
Alcance: primera vertical funcional

## Decisión

La interfaz funcional existente queda como baseline UX/UI de esta versión. No se aplican cambios
visuales especulativos porque los archivos `.pen` disponibles en el repositorio no contienen
pantallas, componentes ni estados comparables (`children: []`). Por lo tanto, no existe un
prototipo aprobado que pueda funcionar como fuente de verdad para un handoff diseño → código.

## Revisión realizada

Se contrastó el frontend actual con los contratos funcionales vigentes:

- Cliente: creación del pedido, PIN visible sólo durante la sesión, pedidos activos y recuperación
  después de recarga/cierre sin recuperar PIN.
- Comercio: revisión, aceptación, preparación y pedido listo.
- Operaciones: cola, asignación, auditoría y cierre.
- Repartidor: retiro, custodia, traslado, llegada y confirmación con PIN, receptor y efectivo.
- Recuperación y errores: estados autoritativos, reintento consciente e idempotencia.

No se identificó una divergencia de UX respaldada por un diseño aprobado que justifique modificar
el frontend antes del piloto.

## Restricciones de esta versión

- No rediseñar componentes ni introducir un sistema visual nuevo antes del piloto.
- No presentar un fallback de PIN como capacidad implementada hasta cerrar su contrato operativo.
- Mantener explícito que el PIN no se recupera ni se persiste.
- Mantener la selección explícita cuando el cliente tiene varios pedidos activos.

## Próximo handoff de diseño

Para una futura iteración, el prototipo deberá incluir como mínimo:

1. pantallas por rol;
2. estados normales, carga, error, pérdida de red y recuperación;
3. escenario `ARRIVED` con PIN perdido y autoridad de Operaciones;
4. componentes, tokens y criterios de aceptación visual;
5. referencia inequívoca entre cada pantalla y su implementación.

La revisión visual futura deberá registrarse como incremento con issue, criterios verificables,
pruebas y sincronización de `WEB-001`/`TRC-001`, respetando el proceso definido en `PRE-DEV-002`.
