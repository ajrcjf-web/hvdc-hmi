// Las órdenes del operador como datos: qué se pide, sin ejecutarlo.
// Ser datos (y no funciones) permite mostrarlas en pantalla, compararlas en tests
// y ejecutarlas más de una vez: al seleccionar (para verificarlas) y al ejecutar.

import {
  requestBlock,
  requestDeblock,
  requestPowerOrder,
  requestTransition,
  type CommandResult,
  type Station,
  type StationConfig,
} from "../station.ts";
import type { StationState } from "../stationState.ts";

export type OperatorCommand =
  | { kind: "transition"; to: StationState }
  | { kind: "block" }
  | { kind: "deblock" }
  | { kind: "powerOrder"; orderMW: number };

export function transitionCommand(to: StationState): OperatorCommand {
  return { kind: "transition", to };
}

export function blockCommand(): OperatorCommand {
  return { kind: "block" };
}

export function deblockCommand(): OperatorCommand {
  return { kind: "deblock" };
}

export function powerOrderCommand(orderMW: number): OperatorCommand {
  return { kind: "powerOrder", orderMW };
}

// Pide la orden a la lógica de la estación. Es el único lugar de la interfaz que
// llama a las funciones de órdenes: ninguna regla se repite aquí. Sirve para
// verificar una orden (descartando la estación resultante) y para ejecutarla.
export function runCommand(
  command: OperatorCommand,
  station: Station,
  config: StationConfig,
): CommandResult {
  switch (command.kind) {
    case "transition":
      return requestTransition(station, command.to, config);
    case "block":
      return requestBlock(station);
    case "deblock":
      return requestDeblock(station);
    case "powerOrder":
      return requestPowerOrder(station, command.orderMW, config);
  }
}

export function commandLabel(command: OperatorCommand): string {
  switch (command.kind) {
    case "transition":
      return `Ir a ${command.to}`;
    case "block":
      return "Bloquear";
    case "deblock":
      return "Desbloquear";
    case "powerOrder":
      return Number.isFinite(command.orderMW)
        ? `Consigna ${command.orderMW} MW`
        : "Consigna (valor no válido)";
  }
}
