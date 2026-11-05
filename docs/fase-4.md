# Fase 4 — Diseño: eventos, alarmas, protecciones y tendencias

Este documento recoge las decisiones de diseño de la Fase 4 antes de implementarla. `CLAUDE.md` se actualiza en cada PR, junto con el cambio que lo motiva (no al cerrar una subfase), y describe el código como es; este documento queda como el registro de por qué se decidió así.

## 1. Ventanas

- Una sola aplicación con **varias ventanas internas** y una **barra de navegación**: overview, alarmas, eventos (SER), tendencias y simulación de fallas.
- Todas comparten la misma simulación (el mismo estado del reducer).
- Las ventanas reales del navegador (una pestaña o pantalla por ventana) llegan con la Fase 5.
- La ventana de **simulación de fallas es del instructor**: el operador no provoca fallas desde sus ventanas.

## 2. Eventos y alarmas

Siguiendo ISA-18.2 / IEC 62682:

- **Evento**: cualquier cosa registrada (una orden, un cambio de posición, una protección que actúa, una alarma que aparece).
- **Alarma**: condición anormal que **requiere una acción del operador**. Toda alarma genera eventos, pero no todo evento es una alarma.
- El estado `inconsistent` genera una **alarma urgente**: es anormal y requiere acción del operador (normalizar en modo manual, ver la sección 6). Así el rojo significa siempre una alarma urgente.

**Prioridades** (tres):

| Prioridad | Color |
|---|---|
| Urgente | rojo |
| Alta | ámbar |
| Baja | amarillo |

**Ciclo de vida** (ISA-18.2):

1. Activa sin reconocer (intermitente).
2. Activa reconocida.
3. Normalizada sin reconocer (sigue visible hasta que se reconoce).
4. Normal.

Reglas:

- **Reconocer no borra**: la alarma sigue en la lista mientras esté activa o sin reconocer.
- Hay reconocimiento **individual** y **de todas las visibles**.
- Las alarmas son **lógica del dominio**: las genera el ciclo de simulación (`runCycle`), no la interfaz, y tienen tests.
- Como el color no puede ser lo único que distinga algo (regla de `CLAUDE.md`), la prioridad también se identifica por texto en su columna, y el parpadeo se acompaña de un símbolo.

## 3. SER (registro secuencial de eventos)

En una estación real, los eventos llegan de cada dispositivo a través del **Gateway**, y la descripción sale de la base de datos del Gateway. Para preparar esa integración:

- Cada evento lleva un **código de señal**, no un texto.
- La descripción sale de una **tabla de señales** (código → descripción).

**Columnas** de la lista de eventos: fecha y hora con milisegundos, descripción y estado actual.

**Listas tipo planilla** (eventos y alarmas):

- La primera fila es de filtros, uno por columna, que filtran **al escribir**.
- Criterio: *contiene*, sin distinguir mayúsculas.
- Los filtros de varias columnas se **combinan** (todos deben cumplirse).
- La lista de alarmas añade una columna de **prioridad**.

El filtrado es una función pura con tests; los componentes solo dibujan.

## 4. Protecciones

Las **provoca y despeja el instructor**, desde la ventana de simulación. No hay re-arranque automático.

| Falla | Protección que actúa | Efecto |
|---|---|---|
| Línea DC, **baja impedancia** | Onda viajera, al instante | Bloqueo del convertidor |
| Línea DC, **alta impedancia** | Diferencial de línea DC, tras un retardo (0.5 s simulados por defecto, configurable). La onda viajera no la detecta | Bloqueo del convertidor |
| Subtensión en la red AC | Subtensión AC (27) | Bloqueo del convertidor |
| Línea AC | Protección de línea AC (21/87L) | Disparo de Q1 y bloqueo |
| Interna del transformador | Diferencial (87T) | Disparo de Q1 y bloqueo |
| Interna del convertidor | Protección del convertidor | Disparo de Q1 y bloqueo |
| Equipo trabado | Supervisión | Alarma de discrepancia (prioridad alta) |

- En la falla de línea DC, el **instructor elige el tipo** (baja o alta impedancia) y el SER registra **qué función actuó**.
- El **bloqueo por protección es instantáneo**: P y Udc pasan a 0 sin rampa (a diferencia del bloqueo del operador, que exige P = 0 y deja bajar Udc con su rampa).
- Las protecciones disparadas generan una **alarma urgente**.
- **Equipo trabado**: la supervisión levanta la discrepancia cuando la maniobra supera el **doble de su tiempo** de maniobra. Al despejar la falla, la maniobra termina.

## 5. Reset remoto de protecciones

- Una protección disparada queda **enclavada** (relé de bloqueo 86) e **impide volver a energizar** hasta que el operador la resetee desde el HMI.
- El reset usa *select-before-operate*, igual que las demás órdenes.
- El reset **se rechaza, con su motivo, mientras la causa siga presente** (la falla no fue despejada por el instructor).
- Este escenario (intentar resetear con la falla presente) es **explícito**: tiene test y prueba manual en el PR.

## 6. Modo manual (issue #36)

- El modo **automático/manual** es visible en pantalla. Cambiarlo usa *select-before-operate*.
- En **manual** hay **mando por equipo** (abrir o cerrar Q1, Q2 y QE por separado), con estos enclavamientos:
  - Todo mando manual de equipos exige el **convertidor bloqueado** (y P = 0, sin rampas). Con el convertidor desbloqueado ninguna maniobra manual se acepta. Solo las protecciones abren Q1 con carga.
  - QE solo se cierra con Q1 y Q2 abiertos.
  - QE cerrado bloquea el cierre de Q1 y Q2.
  - Q2 solo se cierra con QE abierto y Q1 cerrado.
  - Q1 solo se cierra con Q2 y QE abiertos.
- Estos enclavamientos garantizan el cierre **aguas abajo**: primero Q1, después Q2.
- Los enclavamientos se mueven a **una función de mando por equipo** en la lógica. `requestTransition` también la usa, de modo que viven en **un solo lugar**.
- Tras un disparo de Q1 (la estación queda `inconsistent`), el operador normaliza en manual abriendo Q2.

**Simplificación conocida:** con estos enclavamientos no hay *black start* ni modo isla. Habilitarlos requeriría cambiar el interlocking. Es intencional y no se corrige sin que se pida.

## 7. Tendencias

- Variables: **P, Udc e Idc**.
- Ventanas de tiempo: **1 minuto, 10 minutos y 1 hora**.
- Muestreo cada **1 s simulado** (no tiempo real).

## 8. Línea de mensajes (issue #39)

Línea fija con la última respuesta a una orden, **visible en todas las ventanas**.

## Subfases

Se implementan en este orden, cada una con su rama(s), PR(s) y milestone:

| Subfase | Contenido |
|---|---|
| 4.1 | Navegación y eventos: barra de ventanas, tabla de señales, ventana SER |
| 4.2 | Alarmas: modelo, ventana, reconocimiento |
| 4.3 | Modo manual (#36) |
| 4.4 | Fallas y protecciones: ventana de simulación, protecciones, discrepancia, reset remoto |
| 4.5 | Línea de mensajes (#39) y tendencias |

Se publica **una sola versión, v0.4.0**, al cerrar la Fase 4 completa (no una por subfase).

## Impacto en el diseño visual

`CLAUDE.md` hoy dice que el único color de la pantalla es el rojo de `inconsistent` y que el ámbar y el rojo de las alarmas quedan para la Fase 4. Esta fase agrega el ámbar (prioridad alta) y el amarillo (prioridad baja). El rojo pasa a ser **solo la prioridad urgente**: como `inconsistent` genera una alarma urgente, sigue en rojo y deja de tener un rojo propio. Cada color nuevo se define una sola vez en el `:root` de `src/web/styles.css`, y ningún dato depende solo del color.

`CLAUDE.md` se actualiza en el PR de la subfase 4.2, junto con el código de los colores.
