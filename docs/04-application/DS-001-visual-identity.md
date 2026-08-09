# DS-001 — Identidad visual mínima de UspaYa

Estado: BASELINE V1 PARA PROTOTIPO
Fecha: 2026-08-09
Alcance: piloto cerrado y primera vertical funcional

## Principio

UspaYa debe comunicar delivery local con confianza, trazabilidad y cercanía. La interfaz debe ser
rápida para actuar y especialmente clara cuando existe una excepción, pérdida de red o intervención
de Operaciones.

## Referencias competitivas

La baseline toma patrones de productos maduros sin copiar sus marcas:

- PedidosYa: alta visibilidad del estado del pedido, seguimiento y acceso a ayuda.
- Rappi: accesos rápidos, energía visual y acciones principales evidentes.
- Uber Eats: jerarquía limpia, superficies sobrias y reducción del ruido visual.

UspaYa evita usar como identidad primaria el rojo asociado a PedidosYa o el verde brillante asociado
a Rappi. La diferenciación se apoya en una paleta inspirada en la cordillera y el sol andino.

## Firma territorial

La identidad incorpora una silueta geométrica de la cordillera y un sol pequeño como firma visual.
Debe aparecer de forma secundaria en encabezados, estados vacíos o piezas de marca, sin competir con
precios, estados, alertas ni acciones operativas.

- Cordilleras superpuestas: territorio, recorrido y cercanía local.
- Teal profundo: confianza y operación.
- Verde mineral: paisaje y transición.
- Sol ámbar: rapidez y energía.

La montaña no funciona como decoración repetitiva ni sustituye iconos de estado. Se evita usar una
fotografía de paisaje como fondo de formularios porque reduciría contraste y legibilidad.

## Tokens principales

| Rol                     | Token                 | Valor     |
| ----------------------- | --------------------- | --------- |
| Fondo                   | `uspaya-bg`           | `#F7F8F5` |
| Superficie              | `uspaya-surface`      | `#FFFFFF` |
| Acción principal        | `uspaya-primary`      | `#0F766E` |
| Acción principal oscura | `uspaya-primary-dark` | `#115E59` |
| Acento                  | `uspaya-accent`       | `#F59E0B` |
| Texto principal         | `uspaya-text`         | `#0F172A` |
| Texto secundario        | `uspaya-text-muted`   | `#475569` |
| Bordes                  | `uspaya-border`       | `#E2E8F0` |
| Éxito                   | `uspaya-success`      | `#15803D` |
| Advertencia             | `uspaya-warning`      | `#D97706` |
| Error                   | `uspaya-error`        | `#DC2626` |

## Tipografía

- `Manrope`: títulos y jerarquía de pantalla.
- `Inter`: cuerpo, controles, estados y datos operativos.

Antes de llevar estas fuentes a producción debe definirse su carga local o una alternativa de sistema
que no agregue una dependencia remota en tiempo de ejecución.

## Reglas de interfaz

- Una acción primaria por decisión principal.
- Estados y excepciones usan color más texto; nunca dependen sólo del color.
- Alertas rojas quedan reservadas para bloqueo o riesgo, no para decoración de marca.
- El acento naranja señala atención, espera o decisión pendiente.
- Las superficies operativas priorizan datos, autoridad y trazabilidad sobre promociones.
- Radios moderados, sombras mínimas y contraste verificable.

## Implementación en prototipo

`pantallas.pen` contiene el tablero `UspaYa - Visual Identity v1` y variables reutilizables. Los cinco
frames del flujo crítico utilizan la baseline de fondo, superficie, texto, borde y tipografía.

La aplicación inicial en frontend se trasladó a tokens CSS en `apps/web/src/styles.css`, sin
introducir colores aislados por pantalla. La revisión visual final contra los cinco frames y la
verificación completa de contraste/responsive siguen siendo tareas del Gate C.
