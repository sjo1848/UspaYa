# UX-008 — Revisión de prototipo y baseline de interfaz

Estado: CERRADO PARA LA VERSIÓN DE PILOTO
Fecha: 2026-08-08
Alcance: primera vertical funcional

## Decisión

La interfaz funcional existente queda como baseline de las superficies ya implementadas. El archivo
`pantallas.pen` sí contiene un prototipo válido, pero está concentrado en el flujo de PIN perdido y
fallback; todavía no funciona como baseline completa del sistema ni tiene handoff diseño → código
cerrado.

## Revisión realizada

Se revisaron los archivos `.pen` disponibles en el repositorio y el archivo de Pencil indicado
como fuente de trabajo:

- `/home/sjo1848/.pencil/documents/be0a7a19-968c-49fd-b07e-f355fc887ceb/pencil-new.pen` contiene
  únicamente un frame blanco de 800×600 sin hijos.
- `design/uspaya.pen`, `design/uspaya-v1.pen`, `diseño.pen` y `diseño-v1.pen` no contienen
  pantallas utilizables.
- `pantallas.pen` contiene cinco frames mobile de 390×844:
  - `Customer - Recovered Active Order`;
  - `Customer - ARRIVED Without PIN`;
  - `Support - Verification In Progress`;
  - `Courier - Fallback Approved`.
- Se agregó el quinto frame `Operations - Fallback Review`, con caso `SUP-4826`, evidencia
  mínima, rechazo, autorización y nota de trazabilidad.

El frontend funcional actual cubre los recorridos técnicos siguientes:

- Cliente: creación del pedido, PIN visible sólo durante la sesión, pedidos activos y recuperación
  después de recarga/cierre sin recuperar PIN.
- Comercio: revisión, aceptación, preparación y pedido listo.
- Operaciones: cola, asignación, auditoría y cierre.
- Repartidor: retiro, custodia, traslado, llegada y confirmación con PIN, receptor y efectivo.
- Recuperación y errores: estados autoritativos, reintento consciente e idempotencia.

## Estado del prototipo frente al frontend

- `Customer - Recovered Active Order`: parcialmente cubierto. La recuperación y el PIN oculto están
  implementados, pero la composición visual y la acción explícita de ayuda del prototipo no están
  integradas.
- `Customer - ARRIVED Without PIN`: diseñado, no implementado. El fallback sigue requiriendo cierre
  del contrato operativo y endpoints.
- `Support - Verification In Progress`: diseñado, no implementado.
- `Courier - Fallback Approved`: diseñado, no implementado.
- `Operations - Fallback Review`: diseñado, no implementado; requiere el contrato de casos de
  soporte y autorización de Operaciones.

No se aplican todavía cambios visuales del fallback como si fueran una capacidad productiva. Primero
deben sincronizarse `VAL-PIN-001`, `DEC-PIL-021`, `PIN-004` y el contrato técnico aprobado.

## Pantallas que faltan diseñar

Para completar el diseño visual del sistema, el orden recomendado es:

1. Operaciones: aprobar/rechazar la verificación alternativa y ver su trazabilidad.
2. Cliente/Repartidor: completar el flujo ya prototipado de `ARRIVED` y fallback.
3. Cliente: crear pedido, pedido enviado, seguimiento, múltiples pedidos activos y recuperación
   tras recarga.
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
