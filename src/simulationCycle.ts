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

// Un ciclo cubre el intervalo [t, t + dt) y hace, en este orden:
// 1. Aplica las órdenes programadas dentro del intervalo.
// 2. Registra el estado si un múltiplo de SNAPSHOT_INTERVAL_SECONDS cae en el intervalo.
// 3. Hace evolucionar la planta hasta el instante siguiente.
//
// Se usa un intervalo y no una igualdad exacta porque el tiempo se acumula
// sumando dt, y con decimales la suma no es exacta (0.1 + 0.1 + 0.1 ≠ 0.3).
// El fin de un intervalo es exactamente el inicio del siguiente (misma suma),
// así que cada instante pertenece a un solo ciclo: sin huecos ni repeticiones.
export function runCycle(
  station: Station,
  timeSeconds: number,
  scenario: ScheduledCommand[],
  dtSeconds: number,
  config: StationConfig,
): CycleResult {
  const events: CycleEvent[] = [];
  let current = station;
  const nextTimeSeconds = timeSeconds + dtSeconds;

  for (const command of scenario) {
    if (command.atSeconds >= timeSeconds && command.atSeconds < nextTimeSeconds) {
      const result = command.run(current);
      events.push({ kind: "command", label: command.label, result });
      if (result.ok) {
        current = result.station;
      }
    }
  }

  const nextSnapshotSeconds =
    Math.ceil(timeSeconds / SNAPSHOT_INTERVAL_SECONDS) * SNAPSHOT_INTERVAL_SECONDS;
  if (nextSnapshotSeconds < nextTimeSeconds) {
    events.push({ kind: "snapshot", station: current });
  }

  return {
    station: step(current, dtSeconds, config),
    timeSeconds: nextTimeSeconds,
    events,
  };
}
