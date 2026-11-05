// Ciclo de simulación: lo que pasa en cada instante, en un orden fijo.
// Función pura: recibe la estación y devuelve la siguiente, más lo ocurrido.

import { commandStepEvent, detectPlantEvents, type CommandSignal, type SignalEvent } from "./events.ts";
import { step } from "./simulation.ts";
import type { CommandResult, Station, StationConfig } from "./station.ts";

const SNAPSHOT_INTERVAL_SECONDS = 5; // cada cuánto se registra el estado

export type ScheduledCommand = {
  atSeconds: number;
  label: string;
  // La señal de la orden, para registrarla en el SER. Es opcional: la consola
  // (main.ts) no usa el SER.
  signal?: CommandSignal;
  run: (station: Station) => CommandResult;
};

// Lo que ocurrió en un instante: una orden (ejecutada o rechazada), un registro del
// estado o un evento de señal para el SER. Quien llama decide cómo mostrarlo.
export type CycleEvent =
  | { kind: "command"; label: string; result: CommandResult }
  | { kind: "snapshot"; station: Station }
  | { kind: "signal"; event: SignalEvent };

export type CycleResult = {
  station: Station;
  timeSeconds: number; // el instante siguiente
  events: CycleEvent[];
};

// Un ciclo cubre el intervalo [t, t + dt) y hace, en este orden:
// 1. Aplica las órdenes programadas dentro del intervalo. Cada una deja su evento
//    (ejecutada o rechazada) y los cambios que provocó en la estación, con la hora t.
// 2. Registra el estado si un múltiplo de SNAPSHOT_INTERVAL_SECONDS cae en el intervalo.
// 3. Hace evolucionar la planta hasta el instante siguiente. Los cambios que ocurren
//    en este paso (una maniobra que termina) llevan la hora t + dt.
//
// Los eventos de señal se detectan una vez por ciclo, así que su resolución real es dt
// (100 ms en la web) aunque la marca de tiempo muestre milisegundos.
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
      if (command.signal !== undefined) {
        const event = commandStepEvent(
          command.signal,
          result.ok ? "executed" : "rejected",
          timeSeconds,
          result.ok ? undefined : result.reason,
        );
        events.push({ kind: "signal", event });
      }
      if (result.ok) {
        for (const event of detectPlantEvents(current, result.station, timeSeconds)) {
          events.push({ kind: "signal", event });
        }
        current = result.station;
      }
    }
  }

  const nextSnapshotSeconds =
    Math.ceil(timeSeconds / SNAPSHOT_INTERVAL_SECONDS) * SNAPSHOT_INTERVAL_SECONDS;
  if (nextSnapshotSeconds < nextTimeSeconds) {
    events.push({ kind: "snapshot", station: current });
  }

  const next = step(current, dtSeconds, config);
  for (const event of detectPlantEvents(current, next, nextTimeSeconds)) {
    events.push({ kind: "signal", event });
  }

  return { station: next, timeSeconds: nextTimeSeconds, events };
}
