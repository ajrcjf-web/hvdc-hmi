# Simulador HMI de estación HVDC monopolar

Simulador básico de la ventana *overview* de un HMI (interfaz hombre-máquina) que controla y supervisa una estación HVDC monopolar.

> **Estado: en construcción.** Todavía no hay código ejecutable. Este documento describe lo que el proyecto pretende ser y se irá completando a medida que avance.

## Sobre este proyecto

Es un **proyecto de aprendizaje**: lo desarrollo para aprender a programar desde cero, usando como caso práctico el control de una estación de corriente continua en alta tensión (HVDC). Por eso el código y las decisiones de diseño se documentan en español y con lenguaje simple.

**Convención de idioma:** los nombres en el código (variables, funciones, tipos, archivos) están en inglés; los comentarios y la documentación, en español.

## Qué quiere lograr

- Representar el estado de una estación HVDC monopolar (interruptores, seccionador, convertidor y potencia).
- Permitir las órdenes del operador (acoplar, desacoplar, cambiar potencia) respetando las reglas de seguridad del proceso.
- Rechazar las órdenes no permitidas e informar del motivo.

## Conceptos del dominio

### Estados de la estación

La estación pasa por tres estados y **solo puede moverse entre estados vecinos**:

```
stopped  ↔  decoupled  ↔  coupled
```

| Estado | Q1 (interruptor AC) | Convertidor | Q2 (seccionador DC) | ¿Transmite potencia? |
|---|---|---|---|---|
| `stopped` | abierto | bloqueado | abierto | No |
| `decoupled` | cerrado | energizado (junto con el transformador) | abierto | No |
| `coupled` | cerrado | energizado | cerrado | **Sí** |

### Enclavamientos

Un **enclavamiento** es una condición que debe cumplirse para permitir una acción. Si no se cumple, la orden se rechaza. Los principales son:

- Solo se transmite potencia en el estado `coupled`.
- Solo se puede desacoplar con potencia P = 0.
- La potencia cambia con una rampa y debe respetar los límites Pmin y Pmax. La consigna válida es 0, o un valor entre Pmin y Pmax.
- No se puede cambiar de estado mientras la potencia está en rampa.

### Cómo se tratan las órdenes rechazadas

- Una orden no permitida **se rechaza**: el sistema no actúa por su cuenta (por ejemplo, no baja la potencia para poder desacoplar).
- El rechazo **siempre explica el motivo**, por ejemplo: "rechazado: P debe ser 0".
- Un rechazo es un resultado normal, no un error: no rompe el simulador.
- Los enclavamientos viven en la lógica de control, no en la interfaz.

## Tecnologías

- **Ahora:** TypeScript y Node.js.
- **Más adelante:** React + Vite, Vitest (pruebas) y OPC UA.

## Instalación y uso

En construcción. Esta sección se completará cuando exista una primera versión ejecutable.

## Hoja de ruta

- [ ] Modelar los estados y las transiciones válidas.
- [ ] Implementar los enclavamientos y el resultado de las órdenes (hecho o rechazado con motivo).
- [ ] Simular la potencia con rampa y límites.
- [ ] Añadir pruebas con Vitest.
- [ ] Construir la interfaz con React + Vite.
- [ ] Integrar OPC UA.

## Autoría

Proyecto de [ajrcjf-web](https://github.com/ajrcjf-web).
