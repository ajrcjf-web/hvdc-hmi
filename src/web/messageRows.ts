// Qué muestra la barra de mensajes: los últimos eventos del SER, del más reciente al más
// viejo. Función pura: prepara los textos; el componente los pone en pantalla.
// Los textos salen de la tabla de señales (a través de toSerRow), sin duplicarlos (#63),
// y la hora es la del SER, para poder buscar el evento en su ventana.

import { alarmPriorities, type AlarmPriority } from "../alarms.ts";
import type { SerEvent } from "../events.ts";
import type { SignalCode } from "../signals.ts";
import { priorityLabels } from "./alarmView.ts";
import { toSerRow } from "./serView.ts";

export const MESSAGE_ROWS = 3; // cuántos eventos muestra la barra

export type MessageRow = {
  id: number;
  timestamp: string; // el mismo formato que el SER
  text: string; // una sola línea: estado y descripción
  tooltip: string; // la fila completa, con hora
  rejected: boolean; // un rechazo se destaca (✗, negrita)
  alarm: AlarmPriority | null; // la prioridad, si el evento es de una alarma
  active: boolean; // la alarma sigue siendo visible (no está en "normal")
};

// El símbolo de la prioridad, sin la palabra ("!!! Urgente" → "!!!").
function prioritySymbol(priority: AlarmPriority): string {
  return priorityLabels[priority].split(" ")[0] ?? "";
}

function alarmPriority(code: SignalCode): AlarmPriority | null {
  return code in alarmPriorities ? alarmPriorities[code as keyof typeof alarmPriorities] : null;
}

// `events` viene con el más reciente primero, como los guarda el SER.
export function toMessageRows(events: SerEvent[]): MessageRow[] {
  return events.slice(0, MESSAGE_ROWS).map((event): MessageRow => {
    const row = toSerRow(event);
    const alarm = alarmPriority(event.code);
    // Primero el estado, que es lo que más importa de un vistazo (✗ rechazada, activa...);
    // si el texto no cabe en la línea, lo que se corta es el final de la descripción.
    const prefix = alarm === null ? "" : `${prioritySymbol(alarm)} `;
    const text = `${prefix}${row.state} · ${row.description}`;
    return {
      id: row.id,
      timestamp: row.timestamp,
      text,
      tooltip: `${row.timestamp} ${text}`,
      rejected: event.state === "rejected",
      alarm,
      active: alarm !== null && event.state !== "normal",
    };
  });
}
