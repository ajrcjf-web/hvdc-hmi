// Estado de la interfaz web: la estación, el reloj de la simulación, la selección
// de la orden en curso y el registro. Es un "reducer": una función pura que recibe
// el estado y una acción y devuelve el estado nuevo. React la usa con useReducer;
// aquí no hay nada de React.
//
// Las órdenes van en dos pasos (select-before-operate):
//   select  → se verifica la orden con la estación actual; si vale, queda seleccionada
//   execute → la orden pasa a pendiente y la ejecuta runCycle en el siguiente latido,
//             que vuelve a verificarla (la estación pudo cambiar entre los dos pasos)
// Una selección se cierra con execute, cancel o al expirar (en tiempo simulado).

import {
  commandStepEvent,
  timestampMs,
  type SerEvent,
  type SignalEvent,
} from "../events.ts";
import { runCycle, type ScheduledCommand } from "../simulationCycle.ts";
import { createStation, type Station, type StationConfig } from "../station.ts";
import { commandLabel, commandSignal, runCommand, type OperatorCommand } from "./commands.ts";
import { DEFAULT_WINDOW, type WindowId } from "./windows.ts";

export const TICK_MS = 100; // cada cuánto late el reloj (tiempo real)
export const DT_SECONDS = 0.1; // tiempo simulado por latido: velocidad 1× (tiempo real)
export const MAX_LOG_ENTRIES = 20;
// Eventos que guarda el SER. Al llenarse, se descartan los más viejos (como el buffer
// circular de un SER real): sin límite, una sesión larga haría crecer la memoria y el
// redibujo de la tabla sin parar. Con 1000 caben cientos de maniobras (una maniobra
// completa genera unas 10 señales) y la tabla se filtra al escribir sin que se note.
export const MAX_EVENTS = 1000;
export const DEFAULT_SELECTION_TIMEOUT_SECONDS = 15;

// Qué pasó con una orden:
//   selected            se abrió la selección
//   selection-rejected  no se pudo seleccionar (con motivo)
//   execute-ordered     el operador confirmó
//   cancelled           el operador canceló
//   expired             pasó el tiempo sin confirmar
//   done                runCycle ejecutó la orden
//   failed              runCycle rechazó la orden confirmada (con motivo)
export type LogKind =
  | "selected"
  | "selection-rejected"
  | "execute-ordered"
  | "cancelled"
  | "expired"
  | "done"
  | "failed";

export type LogEntry = {
  id: number; // identifica la entrada (React lo necesita para pintar la lista)
  timeSeconds: number;
  kind: LogKind;
  label: string;
  reason: string | null; // solo en los rechazos
};

// La orden elegida que espera confirmación.
export type Selection = {
  command: OperatorCommand;
  selectedAtSeconds: number;
  expiresAtSeconds: number;
};

export type HmiState = {
  config: StationConfig;
  selectionTimeoutSeconds: number;
  activeWindow: WindowId; // la ventana que se ve; la simulación es la misma en todas
  station: Station;
  timeSeconds: number;
  selection: Selection | null; // como mucho una a la vez
  selectionNotice: string | null; // motivo del último rechazo al seleccionar
  pending: ScheduledCommand[]; // órdenes confirmadas que esperan al próximo latido
  log: LogEntry[]; // la más reciente primero
  nextLogId: number;
  startMs: number; // instante de arranque de la simulación (ms desde 1970)
  events: SerEvent[]; // los eventos del SER, el más reciente primero (hasta MAX_EVENTS)
  nextEventId: number; // nunca se repite: nextEventId - events.length = descartados
};

export type HmiAction =
  | { type: "tick" }
  | { type: "select"; command: OperatorCommand }
  | { type: "execute" }
  | { type: "cancel" }
  | { type: "navigate"; window: WindowId };

export function createHmiState(
  config: StationConfig,
  selectionTimeoutSeconds = DEFAULT_SELECTION_TIMEOUT_SECONDS,
  activeWindow: WindowId = DEFAULT_WINDOW,
  // Los tests lo fijan; en la web lo pasa App. Aquí solo se lee una vez, al crear el estado.
  startMs: number = Date.now(),
): HmiState {
  return {
    config,
    selectionTimeoutSeconds,
    activeWindow,
    station: createStation(),
    timeSeconds: 0,
    selection: null,
    selectionNotice: null,
    pending: [],
    log: [],
    nextLogId: 0,
    startMs,
    events: [],
    nextEventId: 0,
  };
}

type LogDraft = Omit<LogEntry, "id">;

// Agrega entradas al registro (en orden cronológico; en la lista queda la más reciente primero).
function withLog(state: HmiState, drafts: LogDraft[]): Pick<HmiState, "log" | "nextLogId"> {
  const entries = drafts.map((draft, i) => ({ ...draft, id: state.nextLogId + i }));
  return {
    log: [...entries.reverse(), ...state.log].slice(0, MAX_LOG_ENTRIES),
    nextLogId: state.nextLogId + drafts.length,
  };
}

// Agrega eventos al SER (en orden cronológico; en la lista queda el más reciente primero),
// con su marca de tiempo: instante de arranque + tiempo simulado.
function withEvents(
  state: HmiState,
  drafts: SignalEvent[],
): Pick<HmiState, "events" | "nextEventId"> {
  const stored = drafts.map((draft, i): SerEvent => {
    const { timeSeconds, ...rest } = draft;
    return { ...rest, id: state.nextEventId + i, timestampMs: timestampMs(state.startMs, timeSeconds) };
  });
  return {
    events: [...stored.reverse(), ...state.events].slice(0, MAX_EVENTS),
    nextEventId: state.nextEventId + drafts.length,
  };
}

function selectCommand(state: HmiState, command: OperatorCommand): HmiState {
  const label = commandLabel(command);

  const reject = (reason: string): HmiState => ({
    ...state,
    selectionNotice: `${label}: ${reason}`,
    ...withLog(state, [
      { timeSeconds: state.timeSeconds, kind: "selection-rejected", label, reason },
    ]),
    ...withEvents(state, [
      commandStepEvent(commandSignal(command), "rejected", state.timeSeconds, reason),
    ]),
  });

  if (state.selection !== null) {
    return reject("Ya hay una selección activa: confirmarla o cancelarla primero");
  }

  // Se verifica con las mismas funciones de órdenes que usará la ejecución.
  // El resultado se descarta: seleccionar no cambia la estación.
  const check = runCommand(command, state.station, state.config);
  if (!check.ok) {
    return reject(check.reason);
  }

  return {
    ...state,
    selection: {
      command,
      selectedAtSeconds: state.timeSeconds,
      expiresAtSeconds: state.timeSeconds + state.selectionTimeoutSeconds,
    },
    selectionNotice: null,
    ...withLog(state, [{ timeSeconds: state.timeSeconds, kind: "selected", label, reason: null }]),
    ...withEvents(state, [commandStepEvent(commandSignal(command), "selected", state.timeSeconds)]),
  };
}

export function hmiReducer(state: HmiState, action: HmiAction): HmiState {
  switch (action.type) {
    case "navigate":
      // Cambiar de ventana no es una orden: no toca la estación, la selección ni el reloj.
      return action.window === state.activeWindow
        ? state
        : { ...state, activeWindow: action.window };

    case "select":
      return selectCommand(state, action.command);

    case "execute": {
      if (state.selection === null) {
        return state;
      }
      // La orden no se ejecuta aquí: queda programada para el instante actual y
      // la ejecuta runCycle en el próximo latido, con el orden de pasos de siempre.
      const { command } = state.selection;
      const label = commandLabel(command);
      const scheduled: ScheduledCommand = {
        atSeconds: state.timeSeconds,
        label,
        signal: commandSignal(command),
        run: (station) => runCommand(command, station, state.config),
      };
      return {
        ...state,
        selection: null,
        selectionNotice: null,
        pending: [...state.pending, scheduled],
        ...withLog(state, [
          { timeSeconds: state.timeSeconds, kind: "execute-ordered", label, reason: null },
        ]),
      };
    }

    case "cancel": {
      if (state.selection === null) {
        return state;
      }
      return {
        ...state,
        selection: null,
        selectionNotice: null,
        ...withLog(state, [
          {
            timeSeconds: state.timeSeconds,
            kind: "cancelled",
            label: commandLabel(state.selection.command),
            reason: null,
          },
        ]),
        ...withEvents(state, [
          commandStepEvent(commandSignal(state.selection.command), "cancelled", state.timeSeconds),
        ]),
      };
    }

    case "tick": {
      const cycle = runCycle(
        state.station,
        state.timeSeconds,
        state.pending,
        DT_SECONDS,
        state.config,
      );

      const drafts: LogDraft[] = [];
      const signals: SignalEvent[] = [];
      for (const event of cycle.events) {
        if (event.kind === "signal") {
          signals.push(event.event);
        } else if (event.kind === "command") {
          drafts.push({
            timeSeconds: state.timeSeconds,
            kind: event.result.ok ? "done" : "failed",
            label: event.label,
            reason: event.result.ok ? null : event.result.reason,
          });
        }
      }

      // La selección expira según el tiempo simulado. Se compara con >= (no con ===)
      // porque el tiempo acumulado tiene error de redondeo.
      let selection = state.selection;
      if (selection !== null && cycle.timeSeconds >= selection.expiresAtSeconds) {
        drafts.push({
          timeSeconds: cycle.timeSeconds,
          kind: "expired",
          label: commandLabel(selection.command),
          reason: null,
        });
        signals.push(commandStepEvent(commandSignal(selection.command), "expired", cycle.timeSeconds));
        selection = null;
      }

      return {
        ...state,
        station: cycle.station,
        timeSeconds: cycle.timeSeconds,
        selection,
        pending: [],
        ...withLog(state, drafts),
        ...withEvents(state, signals),
      };
    }
  }
}
