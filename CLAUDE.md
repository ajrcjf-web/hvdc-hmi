# Proyecto: simulador HMI de estación HVDC monopolar

Simulador básico de la ventana overview de un HMI que controla y
supervisa una estación HVDC monopolar.

## Dominio
- Estados: earthed ↔ stopped ↔ decoupled ↔ coupled (solo transiciones entre vecinos).
- Earthed: seccionadores de puesta a tierra cerrados (para trabajar con seguridad). Q1 abierto, convertidor bloqueado, Q2 abierto. Solo se llega desde stopped y solo se sale hacia stopped.
- Stopped: Q1 (interruptor AC) abierto, convertidor bloqueado, Q2 (seccionador DC) abierto, puesta a tierra abierta.
- Decoupled: Q1 cerrado, transformador y convertidor energizados, Q2 abierto, puesta a tierra abierta.
- Coupled: Q2 cerrado, puesta a tierra abierta. Solo aquí se puede transmitir potencia.
- La puesta a tierra solo está cerrada en earthed.
- Desacoplar solo con P = 0. Potencia con rampa y límites Pmin/Pmax.

## Stack
- **Ahora:** TypeScript, Node.js, GitHub Actions y Vitest (pruebas).
- **Más adelante:** React + Vite, WebSocket y OPC UA.

## Estructura del código
- `src/stationState.ts`: estados (`StationState`) y tabla de transiciones permitidas (`canTransition`).
- `src/station.ts`: la estación (`Station`, `StationConfig`) y las órdenes del operador (`requestTransition`, `requestPowerOrder`).
- `src/main.ts`: punto de entrada; único lugar donde cambia la estación actual.
- `*.test.ts`: tests de Vitest, al lado del archivo que prueban.
- `src/simulation.ts`: evolución de la planta en el tiempo: step

## Cómo ayudarme
- Estoy aprendiendo a programar desde cero con este proyecto.
- Explica el porqué antes del cómo, en español neutro y con lenguaje simple.
- Muéstrame el código completo y explícalo parte por parte.

## Decisiones de diseño
- Consigna de potencia válida: 0, o entre Pmin y Pmax.
- Cambio de estado durante una rampa: se rechaza (por ahora).
- Orden no permitida → se rechaza. Si el operador pide desacoplar con P ≠ 0, el sistema no baja la potencia por su cuenta: una orden hace una sola cosa y el operador sigue al mando.
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
- Configuración por defecto (`defaultConfig`): Pmin = 50 MW, Pmax = 500 MW. Los tests usan su propia configuración.
- Commits y ramas según Conventional Commits; ver docs/WORKFLOW.md.
- la rampa se configura en MW/min (rampRateMWPerMin, 600 por defecto), step es una función pura y la potencia llega exactamente a la consigna para evitar errores de redondeo; el reloj y el escenario viven en main.ts.

## Preguntas abiertas
- Fase 2: enclavamientos de la puesta a tierra. No cerrarla con Q1 o Q2 cerrados (cortocircuito), y no cerrar Q1 ni Q2 con ella cerrada. Hoy solo los garantiza el orden de los estados; al modelar cada equipo habrá que comprobarlos de forma explícita.
- Sin fecha: secuencia automática de desacople (bajar P y abrir Q2), como orden separada y explícita.

## Skills del proyecto
- `/cerrar-fase`: ritual de cierre de fase y publicación de versión (`.claude/skills/cerrar-fase/`).
