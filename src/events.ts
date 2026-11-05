// Eventos: lo que se registra de la estación. Un evento lleva un código de señal y
// el estado de esa señal, nunca un texto (la descripción sale de signals.ts).
// Funciones puras: no leen el reloj ni guardan nada.

import type { Station } from "./station.ts";
import { deriveState } from "./stationState.ts";
import type { CommandStep, SignalCode, SignalState } from "./signals.ts";
import { switchIds, type SwitchId } from "./switchgear.ts";

// Un evento tal como lo produce la lógica: con el tiempo simulado en que ocurrió.
export type SignalEvent = {
  code: SignalCode;
  state: SignalState;
  timeSeconds: number;
  valueMW?: number; // solo en la consigna de potencia
  detail?: string; // solo en los rechazos: el motivo que da la lógica
};

// Un evento guardado en la lista del SER: con identificador y marca de tiempo real.
export type SerEvent = Omit<SignalEvent, "timeSeconds"> & {
  id: number; // identifica el evento (React lo necesita para pintar la lista)
  timestampMs: number; // milisegundos desde 1970, como Date.now()
};

// La orden a la que se refiere un evento: su señal y, si la tiene, su valor.
export type CommandSignal = { code: SignalCode; valueMW?: number };

const positionCodes: Record<SwitchId, SignalCode> = {
  Q1: "Q1.POS",
  Q2: "Q2.POS",
  QE: "QE.POS",
};

// Marca de tiempo = instante de arranque de la simulación + tiempo simulado.
export function timestampMs(startMs: number, timeSeconds: number): number {
  return startMs + Math.round(timeSeconds * 1000);
}

// Un paso de una orden (seleccionada, ejecutada, rechazada...).
export function commandStepEvent(
  signal: CommandSignal,
  step: CommandStep,
  timeSeconds: number,
  detail?: string,
): SignalEvent {
  return {
    code: signal.code,
    state: step,
    timeSeconds,
    ...(signal.valueMW !== undefined && Number.isFinite(signal.valueMW)
      ? { valueMW: signal.valueMW }
      : {}),
    ...(detail !== undefined ? { detail } : {}),
  };
}

// Compara la estación antes y después, y devuelve lo que cambió: la posición de
// cada equipo, el estado de la estación y el bloqueo del convertidor. Si no cambió
// nada, no hay eventos. Cuando varias cosas cambian a la vez, salen en este orden:
// equipos (Q1, Q2, QE), estado de la estación y convertidor.
export function detectPlantEvents(
  before: Station,
  after: Station,
  timeSeconds: number,
): SignalEvent[] {
  const events: SignalEvent[] = [];

  for (const id of switchIds) {
    if (before.switchgear[id].kind !== after.switchgear[id].kind) {
      events.push({ code: positionCodes[id], state: after.switchgear[id].kind, timeSeconds });
    }
  }

  const stateBefore = deriveState(before.switchgear);
  const stateAfter = deriveState(after.switchgear);
  if (stateBefore !== stateAfter) {
    events.push({ code: "STATION.STATE", state: stateAfter, timeSeconds });
  }

  if (before.converter !== after.converter) {
    events.push({ code: "CONVERTER.BLOCK", state: after.converter, timeSeconds });
  }

  return events;
}
