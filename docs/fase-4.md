# Fase 4 — Diseño: eventos, alarmas, protecciones y tendencias

Este documento recoge las decisiones de diseño de la Fase 4 antes de implementarla. `CLAUDE.md` se actualiza en cada PR, junto con el cambio que lo motiva (no al cerrar una subfase), y describe el código como es; este documento queda como el registro de por qué se decidió así.

## 1. Ventanas

- Una sola aplicación con **varias ventanas internas** y una **barra de navegación**: overview, alarmas, eventos (SER), tendencias y simulación de fallas.
- Todas comparten la misma simulación (el mismo estado del reducer).
- Las ventanas reales del navegador (una pestaña o pantalla por ventana) llegan con la Fase 5.
- La ventana de **simulación de fallas es del instructor**: el operador no provoca fallas desde sus ventanas. La ubicación real de una falla queda ahí.
- La ventana **"Protecciones"** (se agrega en la subfase 4.4) es de lectura: el diagrama de protección y medida (transformadores de medida, zonas, qué protección arrancó y cuál actuó, distancia estimada), sin la ubicación real de la falla. Los transformadores de medida no se dibujan en el unifilar de operación, para no saturarlo.

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

Las **provoca y despeja el instructor**, desde la ventana de simulación. No hay re-arranque automático. El plan por PRs está en el issue #73.

El convertidor es **VSC**: ante una falla AC aporta una corriente de falla **limitada**.

| Falla | Protección que actúa | Efecto |
|---|---|---|
| Línea DC, **baja impedancia** | Onda viajera, al instante | Relé 86: bloqueo del convertidor y disparo de Q1 |
| Línea DC, **alta impedancia** | Diferencial de línea DC, tras un retardo (0.5 s simulados por defecto, configurable). La onda viajera no la detecta | Relé 86: bloqueo del convertidor y disparo de Q1 |
| Subtensión en la red AC | Subtensión AC (27), por escalones | Relé 86: bloqueo del convertidor y disparo de Q1 |
| Línea AC | Protección de distancia (21), zonas 1 y 2 (la 87L queda para el enlace con la segunda estación, #67) | Relé 86: bloqueo del convertidor y disparo de Q1 |
| Interna del transformador | Diferencial (87T) | Relé 86: bloqueo del convertidor y disparo de Q1 |
| Interna del convertidor | Protección del convertidor | Relé 86: bloqueo del convertidor y disparo de Q1 |

(El equipo trabado y su alarma de discrepancia, que estaban en esta tabla, pasaron al backlog: issue #74, junto con la protección de falla de interruptor.)

**Por qué todas activan el 86 y disparan Q1.** Se simplifica con **un solo relé de bloqueo por estación**, activado por **todas** las protecciones, sin recierre ni autorrestablecimiento. Antes, la falla de línea DC y la subtensión AC solo bloqueaban el convertidor. En una estación real suelen resolverse bloqueando y reintentando solas, sin disparar el interruptor: aquí se pierde ese realismo, y a cambio el operador debe normalizar siempre (resetear el 86 y volver a armar la secuencia), que es lo que se quiere practicar. Desde coupled, cualquier falla deja la estación `inconsistent` (Q1 abierto, Q2 cerrado); desde decoupled, queda en `stopped`.

### Qué hace el 86 al actuar una protección
- **Bloquea el convertidor al instante**: P, consigna y Udc pasan a 0 sin rampa (a diferencia del bloqueo del operador, que exige P = 0 y deja bajar Udc con su rampa).
- **Dispara Q1** en **1,5 ciclos de la red** (30 ms a 50 Hz): abre con carga y sin pasar por los enclavamientos del operador (que siguen exigiendo el convertidor bloqueado). El tiempo se expresa en ciclos y la frecuencia de la red es un dato de la configuración. El disparo tiene prioridad sobre una maniobra de Q1 en curso; Q2 y QE no se ven afectados. Con dt = 100 ms el disparo termina en el mismo ciclo.
- **Impide cerrar Q1 y desbloquear el convertidor** mientras esté enclavado.
- Las protecciones disparadas generan una **alarma urgente** (una por función), que dura hasta el reset del 86, y el SER registra **qué función actuó**.
- **Orden causal en el SER** dentro del mismo ciclo: arranques, disparos de las protecciones, 86 enclavado, convertidor bloqueado, Q1 abierto, estado de la estación y alarmas.

### Medida y zonas
Cada protección **ve** la falla solo si la **mide**: la falla está en su zona y la zona está energizada. Una falla en una zona sin energizar no la ve ningún relé; la protección actúa en cuanto la zona se energiza (**cierre sobre falla**).

| Punto de medida | Dónde está | Lo usan |
|---|---|---|
| CT1 | lado red de Q1 | 21 y 87T (lado de alta) |
| TP1 | barra AC, lado red de Q1 | 21 y 27 |
| CT2 | lado válvulas del transformador | 87T (lado de baja) y convertidor |
| CT3 | lado DC del convertidor, antes de Q2 | convertidor y medición de Idc |
| Divisor DC | lado línea de Q2 | onda viajera y diferencial de línea DC |

| Zona | Entre | Se energiza cuando |
|---|---|---|
| Línea AC | CT1 → red | siempre (la red es la fuente) |
| Transformador | CT1 – CT2 | Q1 cerrado |
| Convertidor | CT2 – CT3 | Q1 cerrado |
| Línea DC | divisor DC → línea | Q2 cerrado y Udc > 0 |

"Cerrado" usa la regla de la alarma de inconsistencia: un equipo en maniobra cuenta en su posición de origen. Q2, entre CT3 y el divisor, no tiene zona. Además de la zona energizada, la **21** es direccional (mira hacia la red) y necesita corriente por CT1, que solo existe si la estación aporta: ve la falla de línea AC con Q1 cerrado y el convertidor desbloqueado (aporte del VSC). La **27** ve la falla siempre, porque TP1 mide la tensión de barra.

### Ajustes
Cada elemento tiene un **tiempo propio** del relé (no intencional) y un **retardo intencional**, ambos configurables: actúa cuando lleva viendo la falla `propio + retardo`; si deja de verla antes, el contador vuelve a 0. Valores por defecto: unos 30 ms propios para la 87T, la zona 1 de la 21, el escalón 2 de la 27 y el convertidor; unos pocos ms para la onda viajera; retardo de 0.5 s en el diferencial DC y de 300 ms en la zona 2 de la 21 y en el escalón 1 de la 27.
- **21:** zona 1 hasta el 80 % de la línea, instantánea; zona 2 hasta el 120 %, con 300 ms. Sin zona 3. El instructor elige la ubicación de la falla (0 a 150 % del largo de la línea).
- **27:** escalón 1 al 80 % de Un con 300 ms; escalón 2 al 70 % de Un, instantáneo. El simulador incorpora una tensión AC en TP1: el instructor elige la tensión residual de una falla de subtensión, y una falla de línea AC la deja en una residual fija (configurable, 0 % por defecto). Por eso la 27 ve también las fallas de línea AC más allá del 120 % (la 21 no): consecuencia aceptada de la simplificación.
- **SER:** registra el **arranque** de cada elemento que vio la falla y el **disparo** solo del que llegó a disparar. Cuando dispara el más rápido, el bloqueo y el disparo de Q1 quitan la energización o la corriente, y el más lento deja de ver la falla.
- **En la falla de línea DC, el instructor elige el tipo** (baja o alta impedancia).
- La falla no cambia la planta hasta que una protección actúa (simplificación).

## 5. Reset remoto de protecciones

- Una protección disparada queda **enclavada** (relé de bloqueo 86) e **impide volver a energizar** hasta que el operador la resetee desde el HMI.
- El reset usa *select-before-operate*, igual que las demás órdenes.
- El reset **se rechaza, con su motivo, mientras la causa siga presente** (la falla no fue despejada por el instructor).
- Este escenario (intentar resetear con la falla presente) es **explícito**: tiene test y prueba manual en el PR.

## 6. Modo manual (issue #36)

- El modo **automático/manual** es visible en pantalla. Cambiarlo usa *select-before-operate* (la interfaz llega en el PR siguiente; la lógica ya existe: `requestMode`).
- El modo vive en `Station.mode` (`automatic` por defecto). Regla central: volver a automático exige uno de los cuatro estados válidos; se rechaza en `transition` y en `inconsistent`. Pasar a manual sí se acepta desde `inconsistent`. `requestMode` también se rechaza si ya está en ese modo, si hay una maniobra en curso o si hay una rampa de potencia o de tensión.
- `requestTransition` (orden de estado) solo vale en **automático**; `requestSwitchOrder` (orden por equipo) solo en **manual**. Cada una rechaza con motivo si el modo no es el suyo, y después llama a la misma función interna. Las órdenes del convertidor y de potencia valen en los dos modos.
- El cambio de modo y el mando por equipo son órdenes del operador (`OperatorCommand`) con señales propias: `CMD.MODE_AUTOMATIC`, `CMD.MODE_MANUAL` y `CMD.Q1_OPEN`, `CMD.Q1_CLOSE`, `CMD.Q2_OPEN`, `CMD.Q2_CLOSE`, `CMD.QE_OPEN`, `CMD.QE_CLOSE`.
- Cada cambio de modo es un evento del SER (`STATION.MODE`, con el estado `automático` o `manual`).
- En **manual** hay **mando por equipo** (abrir o cerrar Q1, Q2 y QE por separado), con estos enclavamientos:
  - Todo mando manual de equipos exige el **convertidor bloqueado** (y P = 0, sin rampas). Con el convertidor desbloqueado ninguna maniobra manual se acepta. Solo las protecciones abren Q1 con carga.
  - QE solo se cierra con Q1 y Q2 abiertos.
  - QE cerrado bloquea el cierre de Q1 y Q2.
  - Q2 solo se cierra con QE abierto y Q1 cerrado.
  - Q1 solo se cierra con Q2 y QE abiertos.
  - Abrir no tiene más enclavamientos que los de la estación. Se permite abrir Q1 con Q2 cerrado, por flexibilidad en emergencias, aunque lleva a `inconsistent`; la salida de `inconsistent` es abrir Q2.
  - **Por qué abrir no se enclava:** en las subestaciones, la apertura de un interruptor no se enclava, porque lleva a una condición más segura (sin tensión y sin corriente). Lo peligroso es cerrar, no abrir; por eso los enclavamientos se concentran en el cierre.
- Estos enclavamientos garantizan el cierre **aguas abajo**: primero Q1, después Q2.
- Los enclavamientos se mueven a **una función de mando por equipo** en la lógica. `requestTransition` también la usa, de modo que viven en **un solo lugar**.
- Tras un disparo de Q1 (la estación queda `inconsistent`), el operador normaliza en manual abriendo Q2.

**Simplificación conocida:** con estos enclavamientos no hay *black start* ni modo isla. Habilitarlos requeriría cambiar el interlocking. Es intencional y no se corrige sin que se pida.

## 7. Tendencias

- Variables: **P, Udc e Idc**.
- Ventanas de tiempo: **1 minuto, 10 minutos y 1 hora**.
- Muestreo cada **1 s simulado** (no tiempo real).

## 8. Panel lateral de eventos (issue #39)

Panel a la derecha, en vertical, con los **últimos eventos del SER** (del más reciente al más viejo, con scroll interno), **visible en todas las ventanas**. Reemplaza al aviso del panel de órdenes. (El issue pedía una línea de mensajes fija; el diseño pasó por una barra de abajo y terminó en este panel.)

- Cada evento ocupa dos líneas. Línea 1: la hora en formato SER (en chico) y, a la derecha, el estado, que es lo más importante y no se corta. Línea 2: la descripción, con el símbolo al principio; si no cabe se corta con puntos suspensivos y el texto completo queda como tooltip. Las filas de rechazo crecen sin límite de líneas, para que el motivo se lea siempre completo: sin el registro, el panel es el único lugar de la overview donde aparece. Las demás filas siguen en dos líneas.
- No hay un registro de órdenes aparte en la overview (#68): el panel de eventos lo reemplazó, porque todo lo que mostraba está en el SER (selección, cancelación, expiración y el resultado, con el motivo de un rechazo). "Ejecutar" no es un evento.
- Los textos salen de la tabla de señales (como el SER), sin duplicarlos. Los rechazos conservan su jerarquía visual (negrita, ✗) y las alarmas su símbolo y el color de su prioridad.
- Se puede plegar y desplegar con un botón del encabezado. Plegado queda una pestaña angosta en el borde derecho con el contador de eventos llegados desde que se plegó y, para que no se pierda el aviso de una orden rechazada, una marca si llegó un rechazo (✗) o una alarma (su símbolo de prioridad). La elección se recuerda entre sesiones; en pantallas angostas arranca plegado si nunca se eligió.
- "Ver SER completo" abre la ventana del SER.
- La llegada de un evento no mueve nada del contenido; abrir o cerrar el panel sí lo reacomoda (es una acción del operador). Para que tampoco lo mueva la barra de desplazamiento del navegador al aparecer, la página reserva siempre su lugar (`scrollbar-gutter: stable`). El panel no se imprime.

## 9. Ancho de la pantalla (issue #66)

El contenido usa todo el ancho que deja el panel de eventos, con un tope de 2400 px solo para pantallas ultraanchas.

- **Overview:** el unifilar a todo el ancho de la columna y, debajo, estado y órdenes en dos columnas que se apilan solas cuando no caben (mínimo 22rem cada una). El registro de órdenes ya no existe (#68), por eso son dos columnas y no tres.
- **El unifilar crece en distancias, no en letras:** se dibuja en píxeles reales; al ensanchar la ventana se separan los equipos y se alargan las líneas, pero las letras (1rem, como el panel de estado), el grosor de las líneas y los símbolos no cambian. Ninguna etiqueta se solapa a ningún ancho: `layoutDiagram` (función pura con tests) reserva el lugar de cada etiqueta con su texto más ancho. Por debajo del ancho mínimo, el dibujo completo se achica de forma pareja.
- **Planillas (SER y alarmas):** la descripción usa el ancho que sobra; la hora y el estado no se cortan.
- **Pantallas angostas:** sin scroll horizontal; el panel de eventos arranca plegado hasta 900 px.
- Es un primer paso que no condiciona la tarea de ISA-101 de la Fase 6 (jerarquía de pantallas y navegación): solo usa el ancho disponible.

## 10. Indicador de foco (issue #62)

Todo elemento interactivo muestra el foco con el teclado.

- **Anillo:** 3 px sólido, blanco (el texto de máximo brillo), separado 3 px del elemento; sin color (ISA-101) y con más de 7:1 de contraste contra los fondos. Hacia afuera, porque los botones y las cajas de texto tienen fondo claro por defecto; hacia adentro solo donde uno hacia afuera se cortaría (pestaña plegada, listas con scroll), siempre en elementos con fondo oscuro propio.
- **Ventana de confirmación:** el foco inicial está en Cancelar; una línea dice "Con Enter: Cancelar" o "Con Enter: Ejecutar" según el botón enfocado; al cerrarse (ejecutar, cancelar, Escape o expiración) el foco vuelve al botón que la abrió.
- **El foco no se pierde:** al plegar o desplegar el panel de eventos, y en los botones que se apagan al usarlos, que usan `aria-disabled` (siguen enfocables) y ignoran el clic, Enter y la barra espaciadora.

## Subfases

Se implementan en este orden, cada una con su rama(s), PR(s) y milestone:

| Subfase | Contenido |
|---|---|
| 4.1 | Navegación y eventos: barra de ventanas, tabla de señales, ventana SER |
| 4.2 | Alarmas: modelo, ventana, reconocimiento |
| 4.3 | Modo manual (#36) |
| 4.4 | Trabajo previo: panel de eventos (#39) e indicador de foco (#62). Después, fallas y protecciones (#73): protecciones por zona, relé 86, reset remoto, ventana del instructor y ventana "Protecciones". El equipo trabado, la discrepancia y la 50BF salen al backlog (#74) |
| 4.5 | Tendencias |

**Por qué el panel de eventos (#39) pasó de la 4.5 a la 4.4:** el aviso de rechazo del panel de órdenes empuja los botones unos 40 px hacia abajo al aparecer, y suben al desaparecer. Un segundo clic apurado puede seleccionar otra orden, así que es un riesgo de operación, no una mejora estética. La 4.4 agrega muchos mensajes nuevos (fallas, protecciones), y el problema se agravaría; por eso se resuelve antes, como trabajo previo de la subfase. El indicador de foco (#62) va en el mismo bloque por la misma razón: en una pantalla de mando, el operador debe ver qué elemento recibirá la acción.

Se publica **una sola versión, v0.4.0**, al cerrar la Fase 4 completa (no una por subfase).

## Impacto en el diseño visual

`CLAUDE.md` hoy dice que el único color de la pantalla es el rojo de `inconsistent` y que el ámbar y el rojo de las alarmas quedan para la Fase 4. Esta fase agrega el ámbar (prioridad alta) y el amarillo (prioridad baja). El rojo pasa a ser **solo la prioridad urgente**: como `inconsistent` genera una alarma urgente, sigue en rojo y deja de tener un rojo propio. Cada color nuevo se define una sola vez en el `:root` de `src/web/styles.css`, y ningún dato depende solo del color.

`CLAUDE.md` se actualiza en el PR de la subfase 4.2, junto con el código de los colores.
