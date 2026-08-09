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

Se revisaron los archivos `.pen` disponibles en el repositorio y el archivo de Pencil indicado
como fuente de trabajo:

- `/home/sjo1848/.pencil/documents/be0a7a19-968c-49fd-b07e-f355fc887ceb/pencil-new.pen` contiene
  únicamente un frame blanco de 800×600 sin hijos.
- `design/uspaya.pen`, `design/uspaya-v1.pen`, `diseño.pen` y `diseño-v1.pen` no contienen
  pantallas utilizables.

Por lo tanto, no hay pantallas prototipadas pendientes de implementar; las pantallas visuales
pendientes de diseñar son todas las que se definan para una futura baseline. El frontend funcional
actual sí cubre los recorridos técnicos siguientes:

- Cliente: creación del pedido, PIN visible sólo durante la sesión, pedidos activos y recuperación
  después de recarga/cierre sin recuperar PIN.
- Comercio: revisión, aceptación, preparación y pedido listo.
- Operaciones: cola, asignación, auditoría y cierre.
- Repartidor: retiro, custodia, traslado, llegada y confirmación con PIN, receptor y efectivo.
- Recuperación y errores: estados autoritativos, reintento consciente e idempotencia.

No se identificó una divergencia de UX respaldada por un diseño aprobado que justifique modificar
el frontend antes del piloto.

## Pantallas que faltan diseñar

Para una iteración visual acotada al piloto, el orden recomendado es:

1. Cliente: crear pedido, pedido enviado, seguimiento, múltiples pedidos activos y recuperación
   tras recarga.
2. Cliente/Repartidor: estado `ARRIVED` con PIN perdido, instrucciones y autoridad de Operaciones.
3. Operaciones: cola, asignación, cierre y futura gestión del caso de fallback.
4. Comercio: bandeja y estados de aceptación, preparación y listo.
5. Repartidor: retiro, custodia, traslado, llegada y confirmación de entrega.
6. Estados transversales: carga, error, pérdida de red, reintento, permisos y conflicto de versión.

No se debe diseñar todavía una pantalla de recuperación o reemplazo del PIN como si fuera una
capacidad disponible: el PIN continúa siendo no recuperable y el fallback requiere contrato
operativo definitivo.

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
