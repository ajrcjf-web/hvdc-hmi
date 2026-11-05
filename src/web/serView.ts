// Qué se muestra de un evento en la tabla del SER. Función pura: prepara los textos;
// los componentes los ponen en pantalla.

import { formatTimestamp } from "../labels.ts";
import type { SerEvent } from "../events.ts";
import { describeSignal, describeSignalState } from "../signals.ts";

// Una fila de la tabla: las tres columnas ya convertidas en texto.
export type SerRow = {
  id: number;
  timestamp: string; // fecha y hora con milisegundos
  description: string;
  state: string;
};

export function toSerRow(event: SerEvent): SerRow {
  // La descripción sale de la tabla de señales. El valor (consigna) y el motivo
  // (rechazo) son datos del evento y se añaden al final.
  let description = describeSignal(event.code);
  if (event.valueMW !== undefined) {
    description += ` (${event.valueMW} MW)`;
  }
  if (event.detail !== undefined) {
    description += ` — ${event.detail}`;
  }

  // El rechazo lleva su símbolo, como en el registro: se distingue sin depender del color.
  const stateText = describeSignalState(event.state);
  return {
    id: event.id,
    timestamp: formatTimestamp(event.timestampMs),
    description,
    state: event.state === "rejected" ? `✗ ${stateText}` : stateText,
  };
}

export function toSerRows(events: SerEvent[]): SerRow[] {
  return events.map(toSerRow);
}
