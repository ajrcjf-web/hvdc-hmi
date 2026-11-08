# Simulador HMI de estación HVDC monopolar

[![CI](https://github.com/ajrcjf-web/hvdc-hmi/actions/workflows/ci.yml/badge.svg)](https://github.com/ajrcjf-web/hvdc-hmi/actions/workflows/ci.yml)

Simulador básico de la ventana *overview* de un HMI (interfaz hombre-máquina) que controla y supervisa una estación HVDC monopolar.

> **Estado: en desarrollo (Fase 4).** La Fase 3 está completa ([v0.3.0](https://github.com/ajrcjf-web/hvdc-hmi/releases/tag/v0.3.0)): la ventana *overview* web (`npm run dev`) muestra los valores medidos y el unifilar en SVG, y las órdenes del operador se dan con confirmación (*select-before-operate*) y quedan en un registro. Ahora toca la Fase 4: eventos, alarmas y tendencias.

## Sobre este proyecto

Es un **proyecto de aprendizaje**: lo desarrollo para aprender a programar desde cero, usando como caso práctico el control de una estación de corriente continua en alta tensión (HVDC). Por eso el código y las decisiones de diseño se documentan en español y con lenguaje simple.

**Convención de idioma:** nombres en el código (variables, funciones, tipos, archivos) en inglés; comentarios y documentación en español.

## Qué quiere lograr

- Representar el estado de una estación HVDC monopolar (interruptores, seccionador, convertidor y potencia).
- Permitir las órdenes del operador (acoplar, desacoplar, bloquear y desbloquear el convertidor, cambiar potencia) respetando las reglas de seguridad del proceso.
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
| `coupled` | cerrado | bloqueado o desbloqueado (orden del operador) | cerrado | abierta | **Sí** |

Esta tabla está definida en el código (`statePositions`), y el estado de la estación se deduce de las posiciones de los equipos.

### Enclavamientos

Un **enclavamiento** es una condición que debe cumplirse para permitir una acción. Si no se cumple, la orden se rechaza. Los principales son:

- Solo se transmite potencia en el estado `coupled`.
- Q2 no puede maniobrar con corriente: solo con P = 0 y con el convertidor bloqueado.
- El convertidor solo se desbloquea en `coupled`, y solo se bloquea con P y consigna en 0.
- Solo se da consigna de potencia con el convertidor desbloqueado y Udc en su valor nominal.
- No se aceptan órdenes mientras un equipo está en maniobra.
- La potencia cambia con una rampa y debe respetar los límites Pmin y Pmax. La consigna válida es 0, o un valor entre Pmin y Pmax.
- No se puede cambiar de estado mientras la potencia o la tensión están en rampa.
- Solo se permiten las transiciones listadas: lo que no está en la lista, se rechaza (incluido quedarse en el mismo estado).
- No se puede cerrar la puesta a tierra con Q1 o Q2 sin abrir (cortocircuito a tierra).
- No se puede cerrar Q1 ni Q2 con la puesta a tierra sin abrir.

### Cómo se tratan las órdenes rechazadas

- Una orden no permitida **se rechaza**: el sistema no actúa por su cuenta (por ejemplo, no baja la potencia para poder desacoplar).
- El rechazo **siempre explica el motivo**, por ejemplo: "rechazado: P debe ser 0".
- Un rechazo es un resultado normal, no un error: no rompe el simulador.
- Los enclavamientos viven en la lógica de control, no en la interfaz.

## Tecnologías

- **Ahora:** TypeScript, Node.js, React + Vite, Vitest (pruebas) y GitHub Actions (integración continua).
- **Más adelante:** WebSocket y OPC UA.

## Instalación y uso

Requisitos: Node.js 24 o superior y Git.

```bash
git clone https://github.com/ajrcjf-web/hvdc-hmi.git
cd hvdc-hmi
npm install
npm start
```

Otros comandos:

- `npm run dev`: abre la interfaz web (servidor de desarrollo de Vite; la dirección aparece en la terminal, normalmente http://localhost:5173).
- `npm run build`: compila la interfaz web en la carpeta `dist/`.
- `npm test`: ejecuta los tests automáticos.
- `npm run typecheck`: verifica los tipos de TypeScript.

## Hoja de ruta

El proyecto avanza por fases. Al cerrar cada una se publica una versión (`v0.1.0` al cerrar la Fase 1, `v0.2.0` la Fase 2, y así). La `v1.0.0` llegará cuando el simulador completo funcione.

### Fase 0 — El taller ✅

- [x] Entorno de desarrollo: Node.js, Git, VS Code y Claude Code.
- [x] Repositorio en GitHub y flujo de trabajo con ramas y Pull Requests.

### Fase 1 — El cerebro ✅ (v0.1.0)

Lógica de control sin interfaz.

- [x] Modelar los estados y las transiciones válidas.
- [x] Resultado de las órdenes: ejecutada o rechazada con motivo.
- [x] Tests automáticos con Vitest.
- [x] Integración continua con GitHub Actions.
- [x] Enclavamientos de potencia: consigna entre Pmin y Pmax, desacoplar solo con P = 0.
- [x] La estación como objeto con varios datos (estado, potencia, consigna).

### Fase 2 — La planta simulada ✅ (v0.2.0)

- [x] Bucle de tiempo y rampa de potencia.
- [x] Valores medidos: Udc e Idc.
- [x] Q1, Q2 y la puesta a tierra como equipos, con tiempos de maniobra y enclavamientos de puesta a tierra.
- [x] Estado de la estación deducido de las posiciones de los equipos, con cada transición como la maniobra de un equipo.
- [x] Modelo de Udc más fiel: tensión según el estado del convertidor (bloqueado o desbloqueado) y el control.

### Fase 3 — La ventana overview ✅ (v0.3.0)

- [x] Interfaz con React + Vite.
- [x] Unifilar en SVG con estados de los equipos.
- [x] Valores medidos en pantalla.
- [x] Órdenes con confirmación (*select-before-operate*).

### Fase 4 — Eventos, alarmas y tendencias

Diseño completo en [docs/fase-4.md](docs/fase-4.md). Se publica una sola versión, v0.4.0, al cerrar la fase completa.

- [x] **4.1 Navegación y eventos:** barra de ventanas, tabla de señales y ventana SER (registro secuencial de eventos) con filtros por columna y exportación a CSV y a PDF (#47).
- [x] **4.2 Alarmas:** modelo con prioridades y ciclo de vida ISA-18.2, ventana de alarmas y reconocimiento.
- [ ] **4.3 Modo manual** (#36): modo automático/manual y mando por equipo con enclavamientos.
- [ ] **4.4 Fallas y protecciones:** ventana de simulación del instructor, protecciones, discrepancia de equipo trabado y reset remoto.
- [ ] **4.5 Línea de mensajes** (#39) **y tendencias** de P, Udc e Idc.

### Fase 5 — Arquitectura industrial

- [ ] Simulador y HMI como programas separados, comunicados por WebSocket.
- [ ] Comunicación por OPC UA.

### Fase 6 — Nivel profesional

- [ ] Contenedores con Docker.
- [ ] Roles de usuario (operador e ingeniero).
- [ ] Completar el diseño de pantallas según ISA-101 (los colores y la jerarquía visual de la overview ya están hechos en la Fase 3): jerarquía de pantallas y navegación entre ellas, e indicadores de los valores en relación con su rango normal de operación (por ejemplo, barras con la zona normal marcada).
- [ ] Merge en `main` solo con CI en verde.

## Flujo de trabajo

Cómo trabajo con Git, ramas y Pull Requests: [docs/WORKFLOW.md](docs/WORKFLOW.md).

## Autoría

Proyecto de [ajrcjf-web](https://github.com/ajrcjf-web).
Licencia: [MIT](LICENSE).
