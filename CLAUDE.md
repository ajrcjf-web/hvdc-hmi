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
TypeScript, Node.js. Más adelante: React + Vite, Vitest, OPC UA.

## Cómo ayudarme
- Estoy aprendiendo a programar desde cero con este proyecto.
- Explica el porqué antes del cómo, en español neutro y con lenguaje simple.
- Muéstrame el código completo y explícalo parte por parte.
- Después hazme preguntas para pensar, con las respuestas más abajo, separadas.

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

## Preguntas abiertas
- Secuencia automática de desacople (bajar P y abrir Q2).
- Fase de interruptores: enclavamientos de la puesta a tierra. No cerrarla con Q1 o Q2 cerrados (cortocircuito), y no cerrar Q1 ni Q2 con ella cerrada. Hoy solo los garantiza el orden de los estados; al modelar cada interruptor habrá que comprobarlos de forma explícita.
- Próxima fase: ¿qué tipo de dato en TypeScript representa el resultado de una orden ("hecho" o "rechazado con motivo")?
