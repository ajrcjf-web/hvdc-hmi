// Estado de la interfaz web: la estación, el reloj de la simulación y el registro
// de órdenes. Es un "reducer": una función pura que recibe el estado y una acción
// y devuelve el estado nuevo. React la usa con useReducer; aquí no hay nada de React.

import { runCycle, type ScheduledCommand } from "../simulationCycle.ts";
import {
  createStation,
  requestBlock,
  requestDeblock,
  requestPowerOrder,
  requestTransition,
  type CommandResult,
  type Station,
  type StationConfig,
} from "../station.ts";
import type { StationState } from "../stationState.ts";

export const TICK_MS = 100; // cada cuánto late el reloj (tiempo real)
export const DT_SECONDS = 0.1; // tiempo simulado por latido: velocidad 1× (tiempo real)
export const MAX_LOG_ENTRIES = 20;

// Una orden ya resuelta: se ejecutó (reason es null) o se rechazó (con su motivo).
export type LogEntry = {
  id: number; // identifica la entrada (React lo necesita para pintar la lista)
  timeSeconds: number;
  label: string;
  reason: string | null;
};

export type HmiState = {
  config: StationConfig;
  station: Station;
  timeSeconds: number;
  pending: ScheduledCommand[]; // órdenes del operador que esperan al próximo latido
  log: LogEntry[]; // la más reciente primero
  nextLogId: number;
};

export type OperatorCommand = {
  label: string;
  run: (station: Station, config: StationConfig) => CommandResult;
};

export type HmiAction =
  | { type: "tick" }
  | { type: "command"; command: OperatorCommand };

export function createHmiState(config: StationConfig): HmiState {
  return {
    config,
    station: createStation(),
    timeSeconds: 0,
    pending: [],
    log: [],
    nextLogId: 0,
  };
}

export function hmiReducer(state: HmiState, action: HmiAction): HmiState {
  switch (action.type) {
    case "command": {
      // La orden no se ejecuta aquí: queda programada para el instante actual y
      // la ejecuta runCycle en el próximo latido, con el orden de pasos de siempre.
      const { command } = action;
      const scheduled: ScheduledCommand = {
        atSeconds: state.timeSeconds,
        label: command.label,
        run: (station) => command.run(station, state.config),
      };
      return { ...state, pending: [...state.pending, scheduled] };
    }
    case "tick": {
      const cycle = runCycle(
        state.station,
        state.timeSeconds,
        state.pending,
        DT_SECONDS,
        state.config,
      );

      const newEntries: LogEntry[] = [];
      for (const event of cycle.events) {
        if (event.kind === "command") {
          newEntries.push({
            id: state.nextLogId + newEntries.length,
            timeSeconds: state.timeSeconds,
            label: event.label,
            reason: event.result.ok ? null : event.result.reason,
          });
        }
      }

      return {
        ...state,
        station: cycle.station,
        timeSeconds: cycle.timeSeconds,
        pending: [],
        log: [...newEntries.reverse(), ...state.log].slice(0, MAX_LOG_ENTRIES),
        nextLogId: state.nextLogId + newEntries.length,
      };
    }
  }
}

// Las órdenes que puede dar el operador.

export function transitionCommand(to: StationState): OperatorCommand {
  return {
    label: `Ir a ${to}`,
    run: (station, config) => requestTransition(station, to, config),
  };
}

export function deblockCommand(): OperatorCommand {
  return { label: "Desbloquear", run: (station) => requestDeblock(station) };
}

export function blockCommand(): OperatorCommand {
  return { label: "Bloquear", run: (station) => requestBlock(station) };
}

export function powerOrderCommand(orderMW: number): OperatorCommand {
  return {
    label: `Consigna ${orderMW} MW`,
    run: (station, config) => requestPowerOrder(station, orderMW, config),
  };
}
