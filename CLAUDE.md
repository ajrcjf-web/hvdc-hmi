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
- El convertidor se bloquea y desbloquea por orden del operador. Udc sube y baja con su rampa: hacia la tensión nominal con el convertidor desbloqueado, y hacia 0 con el convertidor bloqueado.

## Stack
- **Ahora:** TypeScript, Node.js, GitHub Actions y Vitest (pruebas).
- **Más adelante:** React + Vite, WebSocket y OPC UA.

## Estructura del código
- `src/stationState.ts`: estados (`StationState`), tabla de transiciones permitidas (`canTransition`), posiciones de los equipos por estado (`statePositions`) y deducción del estado a partir de los equipos (`deriveState`).
- `src/station.ts`: la estación (`Station`, `StationConfig`) y las órdenes del operador (`requestTransition`, `requestPowerOrder`, `requestDeblock`, `requestBlock`).
- `src/simulation.ts`: evolución de la planta en el tiempo (`step`): avanza las maniobras de los equipos y las rampas de tensión y de potencia.
- `src/measurements.ts`: valores medidos de la estación (`measure`): Udc se lee de la estación e Idc se calcula.
- `src/switchgear.ts`: equipos Q1, Q2 y QE: posiciones, tiempos de maniobra y enclavamientos (`requestSwitch`, `stepSwitchgear`).
- `src/main.ts`: punto de entrada; reloj, escenario y único lugar donde cambia la estación actual.
- `*.test.ts`: tests de Vitest, al lado del archivo que prueban.
- `src/testSupport.ts`: configuración (`testConfig`) y estaciones de prueba (`stationAt, deblockedAt`) compartidas por los tests.

## Cómo trabajar conmigo
- Estoy aprendiendo a programar con este proyecto. Explica las decisiones y los conceptos nuevos en español neutro y con lenguaje simple.
- Para tareas de código: primero propón un plan breve y espera mi aprobación. Después implementa el cambio completo, con sus tests, y explica qué hiciste y por qué.
- Antes de darme el trabajo por terminado, ejecuta `npm run typecheck` y `npm test`, y muéstrame los resultados.
- Actualiza README y CLAUDE.md si el cambio lo requiere (ver docs/WORKFLOW.md).
- No hagas commits ni push: los hago yo después de revisar el diff.

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
- "En rampa" significa potencia medida ≠ consigna, o Udc ≠ su valor objetivo (nominal desbloqueado, 0 bloqueado).
- Configuración por defecto (`defaultConfig`): Pmin = 50 MW, Pmax = 500 MW, rampa = 600 MW/min, tensión nominal = 500 kV, rampa de tensión = 100 kV/s y tiempos de maniobra (Q1 = 1 s, Q2 = 8 s, QE = 6 s). Los tests usan `testConfig` de `testSupport.ts`.
- La rampa de potencia se configura en MW/min (`rampRateMWPerMin`) y la de tensión en kV/s (`voltageRampKVPerS`, 100 por defecto). Las dos usan la función común `rampTowards`. `step` es una función pura, y cada valor llega exactamente a su objetivo para evitar errores de redondeo. El reloj y el escenario viven en `main.ts`.
- Udc tiene dinámica y se guarda en `Station`. Idc se calcula: Idc = P / Udc, y 0 sin tensión.
- Reglas del convertidor: solo se desbloquea en coupled; solo se bloquea con P y consigna en 0; Q2 no maniobra con el convertidor desbloqueado (hay que bloquear primero); la consigna de potencia exige el convertidor desbloqueado y Udc en su valor nominal; no se cambia de estado mientras Udc o P estén en rampa.
- Un equipo en maniobra no cuenta como abierto: ante la duda, bloquear.
- El estado de la estación no se guarda: se deduce de las posiciones de los equipos (`deriveState`). Además de los cuatro estados, hay dos situaciones extra, `transition` (algún equipo en maniobra) e `inconsistent` (posiciones que no corresponden a ningún estado), en las que no se aceptan órdenes.
- Cada transición entre estados vecinos es la maniobra de un equipo.
- `main.ts` debe ser mínimo y solo conectar piezas. Toda lógica con decisiones, incluido el orden de cada paso de la simulación, vive en funciones con tests.
- Commits y ramas según Conventional Commits; ver docs/WORKFLOW.md.

## Simplificaciones conocidas
Son intencionales: no corregirlas sin que el usuario lo pida. Las mejoras están en los issues de GitHub.
- Cada transición entre estados vecinos es una sola maniobra de un equipo. En la realidad puede incluir pasos intermedios (por ejemplo, verificaciones de posición o maniobras de seccionadores adicionales).
- Udc sigue una rampa fija hacia su valor objetivo (nominal o 0). No se modelan la carga de la línea ni el control de tensión.

## Skills del proyecto
- `/cerrar-fase`: ritual de cierre de fase y publicación de versión (`.claude/skills/cerrar-fase/`).
