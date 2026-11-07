// Estado de la simulación: lo que existiría en el servidor en la Fase 5. Reúne la
// estación, el reloj, las órdenes confirmadas que esperan al próximo ciclo y los
// eventos del SER. No sabe nada de la interfaz (ventana activa, selección, registro
// de órdenes): eso es el estado de la interfaz, en `web/hmiState.ts`.
// Funciones puras: reciben el estado y devuelven uno nuevo.

import { timestampMs, type SerEvent, type SignalEvent } from "./events.ts";
import { runCycle, type CycleEvent, type ScheduledCommand } from "./simulationCycle.ts";
import { createStation, type Station, type StationConfig } from "./station.ts";

// Eventos que guarda el SER. Al llenarse, se descartan los más viejos (como el buffer
// circular de un SER real): sin límite, una sesión larga haría crecer la memoria y el
// redibujo de la tabla sin parar. Con 1000 caben cientos de maniobras (una maniobra
// completa genera unas 10 señales) y la tabla se filtra al escribir sin que se note.
export const MAX_EVENTS = 1000;

export type SimulationState = {
  config: StationConfig;
  station: Station;
  timeSeconds: number;
  pending: ScheduledCommand[]; // órdenes confirmadas que esperan al próximo latido
  startMs: number; // instante de arranque de la simulación (ms desde 1970)
  events: SerEvent[]; // los eventos del SER, el más reciente primero (hasta MAX_EVENTS)
  nextEventId: number; // nunca se repite: nextEventId - events.length = descartados
};

export function createSimulationState(config: StationConfig, startMs: number): SimulationState {
  return {
    config,
    station: createStation(),
    timeSeconds: 0,
    pending: [],
    startMs,
    events: [],
    nextEventId: 0,
  };
}

// Agrega eventos al SER (en orden cronológico; en la lista queda el más reciente primero),
// con su marca de tiempo: instante de arranque + tiempo simulado.
export function appendEvents(state: SimulationState, drafts: SignalEvent[]): SimulationState {
  const stored = drafts.map((draft, i): SerEvent => {
    const { timeSeconds, ...rest } = draft;
    return { ...rest, id: state.nextEventId + i, timestampMs: timestampMs(state.startMs, timeSeconds) };
  });
  return {
    ...state,
    events: [...stored.reverse(), ...state.events].slice(0, MAX_EVENTS),
    nextEventId: state.nextEventId + drafts.length,
  };
}

// Deja una orden confirmada para el instante actual: la ejecuta el próximo ciclo.
export function schedule(state: SimulationState, command: ScheduledCommand): SimulationState {
  return { ...state, pending: [...state.pending, command] };
}

// Corre un ciclo: ejecuta las órdenes pendientes y hace evolucionar la planta. Los
// eventos de señal van al SER; los demás (órdenes, registros) se devuelven a quien llama.
export function advance(
  state: SimulationState,
  dtSeconds: number,
): { state: SimulationState; events: CycleEvent[] } {
  const cycle = runCycle(state.station, state.timeSeconds, state.pending, dtSeconds, state.config);
  const signals = cycle.events.flatMap((e) => (e.kind === "signal" ? [e.event] : []));
  return {
    state: appendEvents(
      { ...state, station: cycle.station, timeSeconds: cycle.timeSeconds, pending: [] },
      signals,
    ),
    events: cycle.events,
  };
}
