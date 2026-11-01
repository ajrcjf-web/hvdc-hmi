// Ciclo de simulación: lo que pasa en cada instante, en un orden fijo.
// Función pura: recibe la estación y devuelve la siguiente, más lo ocurrido.

import { step } from "./simulation.ts";
import type { CommandResult, Station, StationConfig } from "./station.ts";

const SNAPSHOT_INTERVAL_SECONDS = 5; // cada cuánto se registra el estado

export type ScheduledCommand = {
  atSeconds: number;
  label: string;
  run: (station: Station) => CommandResult;
};

// Lo que ocurrió en un instante: una orden (ejecutada o rechazada)
// o un registro del estado. Quien llama decide cómo mostrarlo.
export type CycleEvent =
  | { kind: "command"; label: string; result: CommandResult }
  | { kind: "snapshot"; station: Station };

export type CycleResult = {
  station: Station;
  timeSeconds: number; // el instante siguiente
  events: CycleEvent[];
};

// Un ciclo, en este orden:
// 1. Se aplican las órdenes programadas para este instante.
// 2. Se registra el estado (cada SNAPSHOT_INTERVAL_SECONDS).
// 3. La planta evoluciona hasta el instante siguiente.
export function runCycle(
  station: Station,
  timeSeconds: number,
  scenario: ScheduledCommand[],
  dtSeconds: number,
  config: StationConfig,
): CycleResult {
  const events: CycleEvent[] = [];
  let current = station;

  for (const command of scenario) {
    if (command.atSeconds === timeSeconds) {
      const result = command.run(current);
      events.push({ kind: "command", label: command.label, result });
      if (result.ok) {
        current = result.station;
      }
    }
  }

  if (timeSeconds % SNAPSHOT_INTERVAL_SECONDS === 0) {
    events.push({ kind: "snapshot", station: current });
  }

  return {
    station: step(current, dtSeconds, config),
    timeSeconds: timeSeconds + dtSeconds,
    events,
  };
}
