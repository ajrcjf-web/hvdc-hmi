# Proyecto: simulador HMI de estación HVDC monopolar

Simulador básico de la ventana overview de un HMI que controla y
supervisa una estación HVDC monopolar.

## Dominio
- Estados: earthed ↔ stopped ↔ decoupled ↔ coupled (solo transiciones entre vecinos).
- Earthed: seccionador de puesta a tierra (QE) cerrado (para trabajar con seguridad). Q1 abierto, convertidor bloqueado, Q2 abierto. Solo se llega desde stopped y solo se sale hacia stopped.
- Stopped: Q1 (interruptor AC) abierto, convertidor bloqueado, Q2 (seccionador DC) abierto, puesta a tierra abierta.
- Decoupled: Q1 cerrado, transformador y convertidor energizados, Q2 abierto, puesta a tierra abierta.
- Coupled: Q2 cerrado, puesta a tierra abierta. Solo aquí se puede transmitir potencia.
- La puesta a tierra (equipo QE) solo está cerrada en earthed.
- Q2 no puede maniobrar con corriente: solo se abre o se cierra con P = 0. Potencia con rampa y límites Pmin/Pmax.

## Stack
- **Ahora:** TypeScript, Node.js, GitHub Actions y Vitest (pruebas).
- **Más adelante:** React + Vite, WebSocket y OPC UA.

## Estructura del código
- `src/stationState.ts`: estados (`StationState`), tabla de transiciones permitidas (`canTransition`), posiciones de los equipos por estado (`statePositions`) y deducción del estado a partir de los equipos (`deriveState`).
- `src/station.ts`: la estación (`Station`, `StationConfig`) y las órdenes del operador (`requestTransition`, `requestPowerOrder`).
- `src/simulation.ts`: evolución de la planta en el tiempo (`step`): avanza las maniobras de los equipos y la rampa de potencia.
- `src/measurements.ts`: valores medidos calculados a partir de la estación (`measure`).
- `src/switchgear.ts`: equipos Q1, Q2 y QE: posiciones, tiempos de maniobra y enclavamientos (`requestSwitch`, `stepSwitchgear`).
- `src/main.ts`: punto de entrada; reloj, escenario y único lugar donde cambia la estación actual.
- `*.test.ts`: tests de Vitest, al lado del archivo que prueban.
- `src/testSupport.ts`: configuración (`testConfig`) y estaciones de prueba (`stationAt`) compartidas por los tests.

## Cómo ayudarme
- Estoy aprendiendo a programar desde cero con este proyecto.
- Explica el porqué antes del cómo, en español neutro y con lenguaje simple.
- Muéstrame el código completo y explícalo parte por parte.

## Decisiones de diseño
- Consigna de potencia válida: 0, o entre Pmin y Pmax.
- Cambio de estado durante una rampa: se rechaza (por ahora).
- Orden no permitida → se rechaza. Si el operador pide una maniobra de Q2 con P ≠ 0, el motivo es "Q2 no maniobra con corriente" y el sistema no baja la potencia por su cuenta: una orden hace una sola cosa y el operador sigue al mando.
- El rechazo lleva un motivo. El resultado de una orden rechazada debe explicar por qué (ej. "rechazado: P debe ser 0"), no basta con devolver `false`.
- Un rechazo es un resultado normal, no una excepción: no debe romper el simulador.
- Los enclavamientos viven en la lógica de control, no en la interfaz.
- Las secuencias automáticas (ej. parada ordenada) serán órdenes separadas y explícitas.
- Convención de idioma: nombres en el código (variables, funciones, tipos, archivos) en inglés; comentarios y documentación en español.
- Las transiciones entre estados vecinos son en ambos sentidos (earthed ↔ stopped ↔ decoupled ↔ coupled).
- Las transiciones se definen con una lista blanca (`allowedTransitions`): lo que no está listado, no está permitido.
- Quedarse en el mismo estado (ej. coupled → coupled) no es una transición válida: se rechaza.
- El resultado de una orden es `CommandResult`: `{ ok: true; station }` si se ejecutó, o `{ ok: false; reason }` si se rechazó.
- Las órdenes no modifican la estación que reciben: devuelven una estación nueva (inmutabilidad). Solo `main.ts` guarda la estación actual.
- "En rampa" significa potencia medida ≠ consigna.
- Configuración por defecto (`defaultConfig`): Pmin = 50 MW, Pmax = 500 MW, rampa = 600 MW/min, tensión nominal = 500 kV y tiempos de maniobra (Q1 = 1 s, Q2 = 8 s, QE = 6 s). Los tests usan `testConfig` de `testSupport.ts`.
- La rampa se configura en MW/min (`rampRateMWPerMin`). `step` es una función pura, y la potencia llega exactamente a la consigna para evitar errores de redondeo. El reloj y el escenario viven en `main.ts`.
- Los valores medidos (Udc, Idc) se calculan a partir de la estación; no se guardan (fuente única de verdad). Idc = P / Udc, y 0 sin tensión.
- Un equipo en maniobra no cuenta como abierto: ante la duda, bloquear.
- El estado de la estación no se guarda: se deduce de las posiciones de los equipos (`deriveState`). Además de los cuatro estados, hay dos situaciones extra, `transition` (algún equipo en maniobra) e `inconsistent` (posiciones que no corresponden a ningún estado), en las que no se aceptan órdenes.
- Cada transición entre estados vecinos es la maniobra de un equipo.
- Commits y ramas según Conventional Commits; ver docs/WORKFLOW.md.

## Simplificaciones conocidas
Son intencionales: no corregirlas sin que el usuario lo pida. Las mejoras están en los issues de GitHub.
- Udc es la tensión nominal en coupled y 0 en los demás estados. En la realidad depende del estado del convertidor (bloqueado o desbloqueado), la carga de la línea y el control.
- Cada transición entre estados vecinos es una sola maniobra. En la realidad es una secuencia de varios pasos (por ejemplo, desbloqueo del convertidor).

## Skills del proyecto
- `/cerrar-fase`: ritual de cierre de fase y publicación de versión (`.claude/skills/cerrar-fase/`).
