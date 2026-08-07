# ADR-005 — Stack de UI web con Tailwind CSS y shadcn-vue

**Estado:** ACCEPTED

## Contexto

La Fase 4 convierte la vertical HTTP ya validada en una experiencia ejecutable para cliente,
comercio, operaciones y repartidor. Crear desde cero cada primitive de UI (botones, inputs,
selectores, dialogs, sheets, badges, alerts, etc.) agrega trabajo de accesibilidad, consistencia y
mantenimiento que no diferencia a UspaYa.

Al mismo tiempo, adoptar un framework visual rígido puede condicionar la identidad del producto y
empujar el diseño hacia los componentes disponibles en lugar de los flujos UX aprobados.

## Decisión

El frontend de UspaYa utilizará:

```text
Vue 3
Vite
TypeScript
Tailwind CSS v4
shadcn-vue
```

Reglas:

- shadcn-vue se utiliza para primitives de UI reutilizables;
- los componentes generados/copied viven en el repositorio y pueden adaptarse al diseño de UspaYa;
- Tailwind CSS se incorpora como dependencia deliberada del sistema UI, no como una utilidad
  opcional sin uso demostrado;
- los componentes de negocio siguen siendo propios de UspaYa;
- se incorporan únicamente los primitives requeridos por los flujos en curso;
- no se instala de antemano un catálogo completo de componentes;
- la identidad visual se define mediante tokens/variables y composición propia;
- el frontend no duplica reglas de negocio del backend ni infiere estados no recibidos por API;
- accesibilidad, estados de carga, errores, foco y comportamiento móvil forman parte del criterio de
  terminado.

## Separación de responsabilidades

```text
components/ui/*
  primitives basados en shadcn-vue

components/catalog/*
components/order/*
components/delivery/*
components/operations/*
  componentes de negocio UspaYa
```

Ejemplos de primitives iniciales esperables:

- Button;
- Input;
- Label;
- Card;
- Select;
- Badge;
- Alert;
- Separator;
- Skeleton;
- Sheet cuando el carrito móvil lo requiera;
- Dialog únicamente cuando una confirmación modal esté justificada por UX.

## Política TypeScript para props de Vue

El `tsconfig.base.json` conserva `strict: true`, `noUncheckedIndexedAccess: true` y
`exactOptionalPropertyTypes: true` como política general del monorepo.

`apps/web` desactiva únicamente `exactOptionalPropertyTypes`. La excepción responde a la semántica
de props opcionales y forwarding de Vue/Reka UI: los wrappers de primitives pueden reenviar props
opcionales como `undefined`, mientras esa opción de TypeScript distingue estrictamente entre
propiedad ausente y propiedad presente con valor `undefined`.

No se modifica esta regla en backend, dominio, database ni otros paquetes. Tampoco se desactivan
`strict`, `strictNullChecks` derivados, `noUncheckedIndexedAccess` ni typecheck del frontend.

Se eligió esta excepción acotada en lugar de mantener un fork local de numerosos primitives de
shadcn-vue únicamente para adaptar el forwarding de props. Si el ecosistema Vue/Reka elimina esta
incompatibilidad, se debe intentar restaurar `exactOptionalPropertyTypes: true` en `apps/web`.

## Estado y datos

Este ADR no introduce por sí solo Vue Router, Pinia, Axios ni otra dependencia global. Se agregan
únicamente ante una necesidad demostrada.

La frontera HTTP existente continúa usando el cliente basado en `fetch` salvo que exista evidencia
concreta para cambiarlo.

## Seguridad y privacidad

- shadcn-vue/Tailwind no modifican la política de identidad o autorización;
- el backend sigue siendo autoritativo;
- datos sensibles como el PIN no se persisten en `localStorage`, `sessionStorage`, IndexedDB ni
  logs;
- los componentes de UI no deben ocultar códigos de error estables ni `correlationId` útiles para
  diagnóstico;
- el frontend usa fuentes del sistema y no necesita descargar una tipografía externa para renderizar
  la interfaz base.

## Dependencias y supply chain

Los scripts de instalación continúan bloqueados por defecto por pnpm. `vue-demi` está permitido de
forma explícita en `allowBuilds` porque su postinstall revisado configura la compatibilidad con la
versión instalada de Vue. Esa autorización es específica y no relaja la política para otras
dependencias.

## Consecuencias

### Positivas

- evita reinventar primitives y patrones de accesibilidad comunes;
- reduce inconsistencia visual;
- mantiene control sobre el código y la identidad de UspaYa;
- acelera la construcción de la vertical móvil;
- permite construir un design system incremental;
- evita un fork local de wrappers solo para satisfacer una diferencia de semántica de props.

### Costos

- Tailwind pasa a ser una dependencia estructural del frontend;
- los componentes copiados deben mantenerse y revisarse como código propio;
- existe riesgo de sobrepersonalizar o importar más componentes de los necesarios;
- `apps/web` tiene una excepción explícita a `exactOptionalPropertyTypes` que debe revisarse en el
  futuro.

## Alternativas rechazadas

- crear todos los primitives desde cero;
- adoptar un framework visual rígido como base de toda la experiencia;
- mantener CSS ad hoc por pantalla;
- instalar un catálogo completo de componentes antes de tener uso real;
- parchear de forma permanente cada wrapper generado únicamente para emular
  `exactOptionalPropertyTypes`;
- desactivar la configuración TypeScript estricta de todo el monorepo.

## Revisión

Revisar si shadcn-vue deja de cubrir requisitos de accesibilidad, compatibilidad con Vue/Tailwind o
si el costo de mantener componentes copiados supera el valor de controlarlos localmente. Revisar
también la excepción de `exactOptionalPropertyTypes` cuando Vue, vue-tsc o Reka UI cambien su
semántica de forwarding de props.
