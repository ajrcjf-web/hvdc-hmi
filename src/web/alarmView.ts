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
const priorityRank: Record<AlarmPriority, number> = { urgent: 0, high: 1, low: 2 };

// Lo no reconocido lleva este símbolo además de parpadear: sin movimiento (o con la
// intermitencia desactivada) se distingue igual.
export const UNACKNOWLEDGED_SYMBOL = "●";

// Una fila de la ventana. Las columnas de texto son las que se filtran; el resto son
// datos para dibujar y para los botones.
export type AlarmRow = {
  timestamp: string; // fecha y hora (con milisegundos) del último cambio
  priority: string; // texto de la prioridad, con su símbolo
  description: string;
  state: string; // ciclo de vida; lo no reconocido empieza con el símbolo ●
  code: AlarmCode;
  level: AlarmPriority;
  unacknowledged: boolean;
};

// Las alarmas visibles (activas o sin reconocer), con la más urgente primero y, dentro
// de una misma prioridad, la que cambió más recientemente.
export function toAlarmRows(alarms: AlarmState, startMs: number): AlarmRow[] {
  return visibleAlarms(alarms)
    .map((code): AlarmRow => {
      const life = alarms.life[code];
      const unacknowledged = isUnacknowledged(life);
      const level = alarmPriorities[code];
      return {
        timestamp: formatTimestamp(timestampMs(startMs, alarms.changedAtSeconds[code])),
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
        alarms.changedAtSeconds[b.code] - alarms.changedAtSeconds[a.code],
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

// El texto del indicador: la cantidad y la prioridad más alta, además del color.
export function describeAlarmSummary(summary: AlarmSummary): string {
  if (summary.highest === null) {
    return "Sin alarmas";
  }
  const noun = summary.count === 1 ? "alarma" : "alarmas";
  return `${summary.count} ${noun} · ${priorityLabels[summary.highest]}`;
}
