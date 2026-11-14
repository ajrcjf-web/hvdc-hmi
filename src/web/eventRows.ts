// Qué muestra el panel lateral de eventos: los últimos eventos del SER, del más reciente al
// más viejo. Funciones puras: preparan los textos; el componente los pone en pantalla.
// Los textos salen de la tabla de señales (a través de toSerRow), sin duplicarlos (#63),
// y la hora es la del SER, para poder buscar el evento en su ventana.

import { alarmPriorities, type AlarmPriority } from "../alarms.ts";
import type { SerEvent } from "../events.ts";
import { describeSignalState, type SignalCode } from "../signals.ts";
import { priorityLabels, priorityRank } from "./alarmView.ts";
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
export function prioritySymbol(priority: AlarmPriority): string {
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

// Lo que marca la pestaña del panel plegado: cuántos eventos llegaron desde que se plegó y,
// para que no se pierda el aviso, si entre ellos hay un rechazo o una alarma.
export type NewEventsSummary = {
  count: number;
  rejected: boolean; // llegó una orden rechazada (se marca con ✗)
  alarm: AlarmPriority | null; // la prioridad más alta de las alarmas que aparecieron
};

// `events` viene con el más reciente primero, así que los nuevos (id >= foldedAtId) están
// al principio y se puede parar en el primero que ya estaba al plegar. Solo cuenta como
// alarma la que aparece ("activa sin reconocer"): reconocerla o normalizarla no es nuevo.
export function summarizeNewEvents(
  open: boolean,
  events: SerEvent[],
  nextEventId: number,
  foldedAtId: number,
): NewEventsSummary {
  const count = newEventsCount(open, nextEventId, foldedAtId);
  let rejected = false;
  let alarm: AlarmPriority | null = null;
  if (count > 0) {
    for (const event of events) {
      if (event.id < foldedAtId) break;
      if (event.state === "rejected") rejected = true;
      const priority = alarmPriority(event.code);
      if (priority !== null && event.state === "active-unacknowledged") {
        if (alarm === null || priorityRank[priority] < priorityRank[alarm]) alarm = priority;
      }
    }
  }
  return { count, rejected, alarm };
}

// La etiqueta accesible de la pestaña, con palabras: "3 nuevos, con rechazo, con alarma urgente".
export function describeNewEventsSummary(summary: NewEventsSummary): string {
  const base = describeNewEvents(summary.count);
  if (base === "") return "";
  const parts = [base];
  if (summary.rejected) parts.push("con rechazo");
  if (summary.alarm !== null) {
    const word = priorityLabels[summary.alarm].split(" ")[1]?.toLowerCase() ?? "";
    parts.push(`con alarma ${word}`);
  }
  return parts.join(", ");
}
