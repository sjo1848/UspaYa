# UX-011 — Motion, transiciones y pulido de interacción

**Estado:** P0/P1 INICIAL IMPLEMENTADO — fundamentos, reduced motion, superficies, alertas, timeline
y listas completados; pulido adicional queda diferido al backlog de Etapa 5.

## Objetivo

Usar movimiento para hacer más comprensibles los cambios de estado, confirmar acciones y reducir la
sensación de espera, especialmente en móvil. El movimiento no debe decorar estados críticos ni
reemplazar texto, color, foco o una respuesta autoritativa de la API.

## Alcance del incremento

### P0 — Fundamentos seguros

- tokens de duración y easing compartidos;
- transición de foco, hover, pressed y disabled en primitives;
- estados de carga con entrada/salida suave y `Skeleton` consistente;
- soporte global de `prefers-reduced-motion`;
- ningún movimiento bloquea una acción ni retrasa la respuesta de error.

### P1 — Flujos principales

- entrada de tarjetas de pedido y actualización de listas;
- transición de estados en la timeline de entrega;
- confirmación visual de acciones autoritativas después de la respuesta de API;
- aparición y desaparición de alertas con `aria-live` sin robar el foco;
- transición entre selección de actor y superficie de rol sólo en development/test.

### P2 — Pulido posterior a evidencia

- feedback de retiro, llegada y cierre para repartidor;
- empty states con ilustración o movimiento sutil si el piloto demuestra confusión;
- animaciones de soporte o fallback sólo cuando exista el contrato productivo.

## Reglas de diseño

- movimiento con función: orientar, confirmar o explicar;
- duración objetivo de 120–220 ms para microinteracciones y hasta 300 ms para cambios de superficie;
- no usar rebotes, parpadeos, autoplay ni movimiento continuo en estados de riesgo;
- estado de PIN perdido se comunica con texto, bloqueo y acción segura, nunca con una animación que
  sugiera que puede resolverse automáticamente;
- foco de teclado y lectores de pantalla siguen funcionando durante la transición;
- `prefers-reduced-motion` elimina transformaciones y reduce la transición a cambios instantáneos;
- validar en viewport móvil y en dispositivos de baja potencia.

## Criterios de aceptación

- cada transición tiene una intención documentada;
- no aparecen errores de consola ni layout shifts relevantes;
- las acciones conservan el mismo comportamiento con movimiento reducido;
- los cambios de estado sólo se animan después de una respuesta autoritativa;
- tests de componente cubren estados de carga, éxito, error y `prefers-reduced-motion`;
- captura visual antes/después y revisión manual en móvil;
- no se agregan dependencias de animación sin necesidad demostrada.

## Orden de implementación

```text
tokens → reduced motion → primitives → loading/alerts → timeline → revisión móvil → medición
```

## No hacer todavía

- mapas o ETA animados;
- animaciones de fallback del PIN;
- confeti, gamificación o movimiento persistente;
- transiciones que oculten una mutación pendiente o un rechazo de la API.
