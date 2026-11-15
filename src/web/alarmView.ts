// Qué se muestra de las alarmas: las filas de la ventana de alarmas y el resumen del
// indicador de la barra. Funciones puras: preparan los textos y los datos; los
// componentes solo los dibujan.

import {
  alarmPriorities,
  isUnacknowledged,
  visibleAlarms,
  type AlarmCode,
  type AlarmPriority,
  type AlarmState,
} from "../alarms.ts";
import { timestampMs } from "../events.ts";
import { formatTimestamp } from "../labels.ts";
import { describeSignal, describeSignalState } from "../signals.ts";

// La prioridad también se identifica por texto y por símbolo (el color no puede ser lo único).
export const priorityLabels: Record<AlarmPriority, string> = {
  urgent: "!!! Urgente",
  high: "!! Alta",
  low: "! Baja",
};

// De la más importante a la menos: define el orden de la lista y la "más alta".
export const priorityRank: Record<AlarmPriority, number> = { urgent: 0, high: 1, low: 2 };

// Lo no reconocido lleva este símbolo además de parpadear: sin movimiento (o con la
// intermitencia desactivada) se distingue igual.
export const UNACKNOWLEDGED_SYMBOL = "●";

// Una fila de la ventana. Las columnas de texto son las que se filtran; el resto son
// datos para dibujar y para los botones.
export type AlarmRow = {
  timestamp: string; // fecha y hora (con milisegundos) de la aparición
  priority: string; // texto de la prioridad, con su símbolo
  description: string;
  state: string; // ciclo de vida; lo no reconocido empieza con el símbolo ●
  code: AlarmCode;
  level: AlarmPriority;
  unacknowledged: boolean;
};

// Las alarmas visibles (activas o sin reconocer), con la más urgente primero y, dentro
// de una misma prioridad, la que apareció más recientemente.
export function toAlarmRows(alarms: AlarmState, startMs: number): AlarmRow[] {
  return visibleAlarms(alarms)
    .map((code): AlarmRow => {
      const life = alarms.life[code];
      const unacknowledged = isUnacknowledged(life);
      const level = alarmPriorities[code];
      return {
        timestamp: formatTimestamp(timestampMs(startMs, alarms.activatedAtSeconds[code])),
        priority: priorityLabels[level],
        description: describeSignal(code),
        state: unacknowledged
          ? `${UNACKNOWLEDGED_SYMBOL} ${describeSignalState(life)}`
          : describeSignalState(life),
        code,
        level,
        unacknowledged,
      };
    })
    .sort(
      (a, b) =>
        priorityRank[a.level] - priorityRank[b.level] ||
        alarms.activatedAtSeconds[b.code] - alarms.activatedAtSeconds[a.code],
    );
}

// Lo que muestra el indicador de la barra.
export type AlarmSummary = {
  count: number; // alarmas visibles
  unacknowledged: number; // de ellas, las sin reconocer
  highest: AlarmPriority | null; // la prioridad más alta entre las visibles
  blinking: boolean; // intermitente solo si hay alguna sin reconocer
};

export function summarizeAlarms(alarms: AlarmState): AlarmSummary {
  const visible = visibleAlarms(alarms);
  let highest: AlarmPriority | null = null;
  for (const code of visible) {
    const level = alarmPriorities[code];
    if (highest === null || priorityRank[level] < priorityRank[highest]) {
      highest = level;
    }
  }
  const unacknowledged = visible.filter((code) => isUnacknowledged(alarms.life[code])).length;
  return { count: visible.length, unacknowledged, highest, blinking: unacknowledged > 0 };
}

// El texto del indicador, con el símbolo de lo no reconocido si parpadea.
export function formatAlarmSummary(summary: AlarmSummary): string {
  const text = describeAlarmSummary(summary);
  return summary.blinking ? `${UNACKNOWLEDGED_SYMBOL} ${text}` : text;
}

// Los textos más anchos que puede mostrar el indicador: para cada prioridad, la cantidad máxima
// de alarmas con el símbolo de lo no reconocido, y "Sin alarmas". La barra los dibuja
// superpuestos con el texto real (invisibles) para reservar el ancho del más largo con la fuente
// real: así, cuando llega la primera alarma, el indicador no cambia de ancho ni pasa a otra
// línea. Se generan con la misma función que da el texto real, para que no se desactualicen.
export function widestAlarmSummaryTexts(maxCount: number): string[] {
  const priorities = Object.keys(priorityLabels) as AlarmPriority[];
  return [
    describeAlarmSummary({ count: 0, unacknowledged: 0, highest: null, blinking: false }),
    ...priorities.map((highest) =>
      formatAlarmSummary({ count: maxCount, unacknowledged: maxCount, highest, blinking: true }),
    ),
  ];
}

// El texto del indicador: la cantidad y la prioridad más alta, además del color.
export function describeAlarmSummary(summary: AlarmSummary): string {
  if (summary.highest === null) {
    return "Sin alarmas";
  }
  const noun = summary.count === 1 ? "alarma" : "alarmas";
  return `${summary.count} ${noun} · ${priorityLabels[summary.highest]}`;
}
