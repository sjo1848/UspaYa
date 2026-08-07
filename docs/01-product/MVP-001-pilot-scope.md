# MVP-001 — Alcance provisional del piloto

Este resumen guía la implementación, pero no reemplaza la validación local.

## Hipótesis del piloto

- 2 comercios iniciales y un tercero de expansión;
- 15 clientes invitados, mínimo operativo 10;
- una zona dentro del núcleo urbano de Uspallata;
- viernes y sábado de 19:00 a 23:00;
- máximo orientativo de 10 pedidos por jornada;
- efectivo y transferencia manual;
- `USPAYA_DELIVERY` principal;
- `CUSTOMER_PICKUP` alternativo;
- `MERCHANT_DELIVERY` solo si el comercio ya posee reparto;
- asignación manual;
- una entrega activa por repartidor;
- soporte humano y canal alternativo.

## Primera vertical técnica

La primera vertical reduce aún más el alcance:

- un comercio;
- una sucursal;
- efectivo con gate `NONE`;
- `USPAYA_DELIVERY`;
- asignación manual directa;
- PIN normal;
- datos ficticios.

## Decisiones que siguen externas

- comercios y clientes reales;
- perímetro y horarios definitivos;
- precio de entrega;
- compensación y seguro;
- vehículos;
- transferencia y validación de comprobantes;
- retornos;
- fallback definitivo del PIN;
- autoridad de reembolsos.

## Regla

Una hipótesis del piloto puede implementarse solo si es configurable, reversible o estrictamente necesaria para `DEV-001`.
