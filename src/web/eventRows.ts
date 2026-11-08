// Qué muestra el panel lateral de eventos: los últimos eventos del SER, del más reciente al
// más viejo. Funciones puras: preparan los textos; el componente los pone en pantalla.
// Los textos salen de la tabla de señales (a través de toSerRow), sin duplicarlos (#63),
// y la hora es la del SER, para poder buscar el evento en su ventana.

import { alarmPriorities, type AlarmPriority } from "../alarms.ts";
import type { SerEvent } from "../events.ts";
import { describeSignalState, type SignalCode } from "../signals.ts";
import { priorityLabels } from "./alarmView.ts";
import { toSerRow } from "./serView.ts";

// Cuántos eventos dibuja el panel. El SER guarda hasta 1000; dibujarlos todos en cada
// latido (100 ms) no hace falta: el resto está en la ventana del SER.
export const PANEL_EVENT_LIMIT = 50;

export type EventRow = {
  id: number;
  timestamp: string; // el mismo formato que el SER
  description: string; // con el símbolo al principio (prioridad de la alarma, o ✗); es lo que se corta
  state: string; // el estado de la señal: va aparte y no se corta
  tooltip: string; // la fila completa: hora · descripción · estado
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
export function toEventRows(events: SerEvent[]): EventRow[] {
  return events.slice(0, PANEL_EVENT_LIMIT).map((event): EventRow => {
    const row = toSerRow(event);
    const alarm = alarmPriority(event.code);
    // El estado es lo más importante y no se puede cortar: va aparte, en la línea de la
    // hora. La descripción es lo que se corta con puntos suspensivos si no cabe, así que el
    // símbolo de la prioridad y el ✗ de un rechazo van al principio de ella y no se pierden.
    // El ✗ no se repite en el estado.
    const rejected = event.state === "rejected";
    const prefix = alarm === null ? (rejected ? "✗ " : "") : `${prioritySymbol(alarm)} `;
    const description = `${prefix}${row.description}`;
    const state = describeSignalState(event.state);
    return {
      id: row.id,
      timestamp: row.timestamp,
      description,
      state,
      // Mismo orden que el SER: hora · descripción · estado.
      tooltip: `${row.timestamp} ${description} · ${state}`,
      rejected,
      alarm,
      active: alarm !== null && event.state !== "normal",
    };
  });
}

// Los eventos llegados desde que se plegó el panel. Con el panel abierto es 0: el contador
// vuelve a cero al desplegarlo. `foldedAtId` es el `nextEventId` del momento de plegar.
export function newEventsCount(open: boolean, nextEventId: number, foldedAtId: number): number {
  return open ? 0 : Math.max(0, nextEventId - foldedAtId);
}

export const MAX_SHOWN_NEW_EVENTS = 99;

// El contador de la pestaña: tope "99+"; vacío si no hay eventos nuevos.
export function formatNewEventsCount(count: number): string {
  if (count <= 0) return "";
  return count > MAX_SHOWN_NEW_EVENTS ? `${MAX_SHOWN_NEW_EVENTS}+` : String(count);
}

// La cantidad de eventos nuevos en palabras, para la etiqueta accesible de la pestaña:
// "1 nuevo" en singular y "n nuevos" en plural (también con el tope: "99+ nuevos").
export function describeNewEvents(count: number): string {
  if (count <= 0) return "";
  return `${formatNewEventsCount(count)} ${count === 1 ? "nuevo" : "nuevos"}`;
}
