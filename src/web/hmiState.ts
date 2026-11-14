// Estado de la interfaz web. Se divide en dos partes con un corte limpio:
//   simulation  lo que en la Fase 5 vivirá en el servidor (estación, reloj, eventos)
//   ui          lo que es solo de la interfaz (ventana activa, selección, registro)
// Es un "reducer": una función pura que recibe el estado y una acción y devuelve el
// estado nuevo. React la usa con useReducer; aquí no hay nada de React.
//
// Las órdenes van en dos pasos (select-before-operate):
//   select  → se verifica la orden con la estación actual; si vale, queda seleccionada
//   execute → la orden pasa a pendiente y la ejecuta runCycle en el siguiente latido,
//             que vuelve a verificarla (la estación pudo cambiar entre los dos pasos)
// Una selección se cierra con execute, cancel o al expirar (en tiempo simulado).

import type { AlarmCode, TestAlarmCode } from "../alarms.ts";
import { commandStepEvent, type SignalEvent } from "../events.ts";
import type { ScheduledCommand } from "../simulationCycle.ts";
import {
  acknowledgeAlarm,
  acknowledgeAlarms,
  advance,
  appendEvents,
  createSimulationState,
  schedule,
  setTestAlarm,
  type SimulationState,
} from "../simulationState.ts";
import { hasReached } from "../simulationTime.ts";
import type { StationConfig } from "../station.ts";
import { commandLabel, commandSignal, runCommand, type OperatorCommand } from "./commands.ts";
import { DEFAULT_WINDOW, type WindowId } from "./windows.ts";

export const TICK_MS = 100; // cada cuánto late el reloj (tiempo real)
export const DT_SECONDS = 0.1; // tiempo simulado por latido: velocidad 1× (tiempo real)
export const DEFAULT_SELECTION_TIMEOUT_SECONDS = 15;

// La orden elegida que espera confirmación.
export type Selection = {
  command: OperatorCommand;
  selectedAtSeconds: number;
  expiresAtSeconds: number;
};

// Lo que es solo de la interfaz: el servidor de la Fase 5 no lo necesita.
export type UiState = {
  selectionTimeoutSeconds: number;
  activeWindow: WindowId; // la ventana que se ve; la simulación es la misma en todas
  selection: Selection | null; // como mucho una a la vez
  eventsPanelOpen: boolean; // el panel lateral de eventos: desplegado o plegado
  eventsFoldedAtId: number; // nextEventId al plegarlo: de ahí se cuentan los eventos nuevos
};

export type HmiState = {
  simulation: SimulationState;
  ui: UiState;
};

export type HmiAction =
  | { type: "tick" }
  | { type: "select"; command: OperatorCommand }
  | { type: "execute" }
  | { type: "cancel" }
  | { type: "navigate"; window: WindowId }
  | { type: "toggle-events-panel" } // plegar o desplegar el panel (acción del operador, no orden)
  // Alarmas: reconocer no es una orden de mando (no hay selección ni enclavamientos).
  | { type: "acknowledge-alarm"; code: AlarmCode }
  | { type: "acknowledge-alarms"; codes: AlarmCode[] } // las que la ventana muestra
  | { type: "set-test-alarm"; code: TestAlarmCode; active: boolean }; // del instructor

export function createHmiState(
  config: StationConfig,
  selectionTimeoutSeconds = DEFAULT_SELECTION_TIMEOUT_SECONDS,
  activeWindow: WindowId = DEFAULT_WINDOW,
  // Los tests lo fijan; en la web lo pasa App. Aquí solo se lee una vez, al crear el estado.
  startMs: number = Date.now(),
  eventsPanelOpen = true, // visible por defecto; App lo decide con la preferencia guardada
): HmiState {
  return {
    simulation: createSimulationState(config, startMs),
    ui: {
      selectionTimeoutSeconds,
      activeWindow,
      selection: null,
      eventsPanelOpen,
      eventsFoldedAtId: 0,
    },
  };
}

function selectCommand(state: HmiState, command: OperatorCommand): HmiState {
  const { simulation, ui } = state;

  // El rechazo deja su evento en el SER, con el motivo; la interfaz no cambia.
  const reject = (reason: string): HmiState => ({
    simulation: appendEvents(simulation, [
      commandStepEvent(commandSignal(command), "rejected", simulation.timeSeconds, reason),
    ]),
    ui,
  });

  if (ui.selection !== null) {
    return reject("Ya hay una selección activa: confirmarla o cancelarla primero");
  }

  // Se verifica con las mismas funciones de órdenes que usará la ejecución.
  // El resultado se descarta: seleccionar no cambia la estación.
  const check = runCommand(command, simulation.station, simulation.config);
  if (!check.ok) {
    return reject(check.reason);
  }

  return {
    simulation: appendEvents(simulation, [
      commandStepEvent(commandSignal(command), "selected", simulation.timeSeconds),
    ]),
    ui: {
      ...ui,
      selection: {
        command,
        selectedAtSeconds: simulation.timeSeconds,
        expiresAtSeconds: simulation.timeSeconds + ui.selectionTimeoutSeconds,
      },
    },
  };
}

export function hmiReducer(state: HmiState, action: HmiAction): HmiState {
  const { simulation, ui } = state;

  switch (action.type) {
    case "navigate":
      // Cambiar de ventana no es una orden: no toca la estación, la selección ni el reloj.
      return action.window === ui.activeWindow
        ? state
        : { simulation, ui: { ...ui, activeWindow: action.window } };

    case "toggle-events-panel":
      // Al plegar se anota cuántos eventos hay, para contar los nuevos desde ese momento.
      // Al desplegar el contador vuelve a cero (con el panel abierto no se cuenta).
      return {
        simulation,
        ui: {
          ...ui,
          eventsPanelOpen: !ui.eventsPanelOpen,
          eventsFoldedAtId: simulation.nextEventId,
        },
      };

    case "acknowledge-alarm":
      return { simulation: acknowledgeAlarm(simulation, action.code), ui };

    case "acknowledge-alarms":
      return { simulation: acknowledgeAlarms(simulation, action.codes), ui };

    case "set-test-alarm":
      return { simulation: setTestAlarm(simulation, action.code, action.active), ui };

    case "select":
      return selectCommand(state, action.command);

    case "execute": {
      if (ui.selection === null) {
        return state;
      }
      // La orden no se ejecuta aquí: queda programada para el instante actual y
      // la ejecuta runCycle en el próximo latido, con el orden de pasos de siempre.
      const { command } = ui.selection;
      const scheduled: ScheduledCommand = {
        atSeconds: simulation.timeSeconds,
        label: commandLabel(command),
        signal: commandSignal(command),
        run: (station) => runCommand(command, station, simulation.config),
      };
      return {
        simulation: schedule(simulation, scheduled),
        // "Ejecutar" no es un evento: 100 ms después aparece como ejecutada o rechazada.
        ui: { ...ui, selection: null },
      };
    }

    case "cancel": {
      if (ui.selection === null) {
        return state;
      }
      return {
        simulation: appendEvents(simulation, [
          commandStepEvent(commandSignal(ui.selection.command), "cancelled", simulation.timeSeconds),
        ]),
        ui: { ...ui, selection: null },
      };
    }

    case "tick": {
      const cycle = advance(simulation, DT_SECONDS);

      // La selección expira según el tiempo simulado. Se compara con hasReached (no con
      // === ni con >=) porque el tiempo acumulado tiene error de redondeo.
      let nextSimulation = cycle.state;
      let selection = ui.selection;
      if (selection !== null && hasReached(nextSimulation.timeSeconds, selection.expiresAtSeconds)) {
        const expired: SignalEvent = commandStepEvent(
          commandSignal(selection.command),
          "expired",
          nextSimulation.timeSeconds,
        );
        nextSimulation = appendEvents(nextSimulation, [expired]);
        selection = null;
      }

      return {
        simulation: nextSimulation,
        ui: { ...ui, selection },
      };
    }
  }
}
