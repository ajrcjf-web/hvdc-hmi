# Simulador HMI de estación HVDC monopolar

[![CI](https://github.com/ajrcjf-web/hvdc-hmi/actions/workflows/ci.yml/badge.svg)](https://github.com/ajrcjf-web/hvdc-hmi/actions/workflows/ci.yml)

Simulador básico de la ventana *overview* de un HMI (interfaz hombre-máquina) que controla y supervisa una estación HVDC monopolar.

> **Estado: en desarrollo (Fase 1).** Ya existe el modelo de estados, las órdenes del operador con sus enclavamientos (transiciones y potencia), y sus tests automáticos con CI. Todavía no hay simulación del tiempo ni interfaz gráfica.

## Sobre este proyecto

Es un **proyecto de aprendizaje**: lo desarrollo para aprender a programar desde cero, usando como caso práctico el control de una estación de corriente continua en alta tensión (HVDC). Por eso el código y las decisiones de diseño se documentan en español y con lenguaje simple.

**Convención de idioma:** nombres en el código (variables, funciones, tipos, archivos) en inglés; comentarios y documentación en español.

## Qué quiere lograr

- Representar el estado de una estación HVDC monopolar (interruptores, seccionador, convertidor y potencia).
- Permitir las órdenes del operador (acoplar, desacoplar, cambiar potencia) respetando las reglas de seguridad del proceso.
- Rechazar las órdenes no permitidas e informar del motivo.

## Conceptos del dominio

### Estados de la estación

La estación pasa por cuatro estados y **solo puede moverse entre estados vecinos**, en ambos sentidos:

```
earthed  ↔  stopped  ↔  decoupled  ↔  coupled
```

Quedarse en el mismo estado (por ejemplo, de `coupled` a `coupled`) **no es una transición válida** y se rechaza.

| Estado | Q1 (interruptor AC) | Convertidor | Q2 (seccionador DC) | Puesta a tierra | ¿Transmite potencia? |
|---|---|---|---|---|---|
| `earthed` | abierto | bloqueado | abierto | **cerrada** | No |
| `stopped` | abierto | bloqueado | abierto | abierta | No |
| `decoupled` | cerrado | energizado (junto con el transformador) y bloqueado | abierto | abierta | No |
| `coupled` | cerrado | energizado; desbloqueado si P > 0 | cerrado | abierta | **Sí** |

### Enclavamientos

Un **enclavamiento** es una condición que debe cumplirse para permitir una acción. Si no se cumple, la orden se rechaza. Los principales son:

- Solo se transmite potencia en el estado `coupled`.
- Solo se puede desacoplar con potencia P = 0.
- La potencia cambia con una rampa y debe respetar los límites Pmin y Pmax. La consigna válida es 0, o un valor entre Pmin y Pmax.
- No se puede cambiar de estado mientras la potencia está en rampa.
- Solo se permiten las transiciones listadas: lo que no está en la lista, se rechaza (incluido quedarse en el mismo estado).

### Cómo se tratan las órdenes rechazadas

- Una orden no permitida **se rechaza**: el sistema no actúa por su cuenta (por ejemplo, no baja la potencia para poder desacoplar).
- El rechazo **siempre explica el motivo**, por ejemplo: "rechazado: P debe ser 0".
- Un rechazo es un resultado normal, no un error: no rompe el simulador.
- Los enclavamientos viven en la lógica de control, no en la interfaz.

## Tecnologías

- **Ahora:** TypeScript, Node.js, Vitest (pruebas) y GitHub Actions (integración continua).
- **Más adelante:** React + Vite, WebSocket y OPC UA.

## Instalación y uso

Requisitos: Node.js 24 o superior y Git.

```bash
git clone https://github.com/ajrcjf-web/hvdc-hmi.git
cd hvdc-hmi
npm install
npm start
```

Otros comandos:

- `npm test`: ejecuta los tests automáticos.
- `npm run typecheck`: verifica los tipos de TypeScript.

## Hoja de ruta

El proyecto avanza por fases. Al cerrar cada una se publica una versión (`v0.1.0` al cerrar la Fase 1, `v0.2.0` la Fase 2, y así). La `v1.0.0` llegará cuando el simulador completo funcione.

### Fase 0 — El taller ✅

- [x] Entorno de desarrollo: Node.js, Git, VS Code y Claude Code.
- [x] Repositorio en GitHub y flujo de trabajo con ramas y Pull Requests.

### Fase 1 — El cerebro 🟡

Lógica de control sin interfaz.

- [x] Modelar los estados y las transiciones válidas.
- [x] Resultado de las órdenes: ejecutada o rechazada con motivo.
- [x] Tests automáticos con Vitest.
- [x] Integración continua con GitHub Actions.
- [x] Enclavamientos de potencia: consigna entre Pmin y Pmax, desacoplar solo con P = 0.
- [x] La estación como objeto con varios datos (estado, potencia, consigna).

### Fase 2 — La planta simulada

- [ ] Bucle de tiempo y rampa de potencia.
- [ ] Valores medidos: Udc e Idc.
- [ ] Q1, Q2 y la puesta a tierra como equipos, con sus propios enclavamientos y tiempos de maniobra.

### Fase 3 — La ventana overview

- [ ] Interfaz con React + Vite.
- [ ] Unifilar en SVG con estados de los equipos.
- [ ] Valores medidos en pantalla.
- [ ] Órdenes con confirmación (*select-before-operate*).

### Fase 4 — Eventos, alarmas y tendencias

- [ ] Lista de eventos con marca de tiempo.
- [ ] Alarmas con reconocimiento.
- [ ] Gráficos de tendencia de potencia y tensión.
- [ ] Fallas simuladas (por ejemplo, falla en la línea DC).

### Fase 5 — Arquitectura industrial

- [ ] Simulador y HMI como programas separados, comunicados por WebSocket.
- [ ] Comunicación por OPC UA.

### Fase 6 — Nivel profesional

- [ ] Contenedores con Docker.
- [ ] Roles de usuario (operador e ingeniero).
- [ ] Diseño de pantallas según ISA-101.
- [ ] Merge en `main` solo con CI en verde.

## Flujo de trabajo

Cómo trabajo con Git, ramas y Pull Requests: [docs/WORKFLOW.md](docs/WORKFLOW.md).

## Autoría

Proyecto de [ajrcjf-web](https://github.com/ajrcjf-web).
Licencia: [MIT](LICENSE).
