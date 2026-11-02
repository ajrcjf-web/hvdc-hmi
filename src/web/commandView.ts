// Qué se muestra de una orden y de una entrada del registro. Funciones puras:
// solo preparan textos y datos; los componentes los ponen en pantalla.

import { formatValue } from "../labels.ts";
import type { Station, StationConfig } from "../station.ts";
import { deriveState, type DerivedState } from "../stationState.ts";
import { commandLabel, runCommand, type OperatorCommand } from "./commands.ts";
import type { LogEntry } from "./hmiState.ts";

export type CommandView = {
  title: string;
  current: {
    state: DerivedState;
    converter: Station["converter"];
    powerMW: number;
    powerOrderMW: number;
  };
  expected: string; // resultado esperado, en palabras
  powerOrder: { currentMW: number; newMW: number } | null; // solo para la consigna
  // Verificación en vivo con la estación actual: si la orden dejó de ser válida,
  // trae el motivo. Es informativa: la lógica decide de verdad al ejecutar.
  check: { ok: true } | { ok: false; reason: string };
};

function expectedOutcome(command: OperatorCommand, station: Station, config: StationConfig): string {
  switch (command.kind) {
    case "transition":
      return `La estación pasará de ${deriveState(station.switchgear)} a ${command.to}`;
    case "deblock":
      return `El convertidor se desbloqueará y Udc subirá hacia ${config.ratedVoltageKV} kV`;
    case "block":
      return "El convertidor se bloqueará y Udc bajará a 0 kV";
    case "powerOrder":
      return `P seguirá la consigna con una rampa de ${config.rampRateMWPerMin} MW/min`;
  }
}

export function describeCommand(
  command: OperatorCommand,
  station: Station,
  config: StationConfig,
): CommandView {
  // Se verifica con las funciones de órdenes de siempre; la estación resultante se descarta.
  const result = runCommand(command, station, config);

  return {
    title: commandLabel(command),
    current: {
      state: deriveState(station.switchgear),
      converter: station.converter,
      powerMW: station.powerMW,
      powerOrderMW: station.powerOrderMW,
    },
    expected: expectedOutcome(command, station, config),
    powerOrder:
      command.kind === "powerOrder"
        ? { currentMW: station.powerOrderMW, newMW: command.orderMW }
        : null,
    check: result.ok ? { ok: true } : { ok: false, reason: result.reason },
  };
}

// Segundos que faltan para que expire la selección, redondeados hacia arriba
// (así nunca se muestra 0 mientras queda algo de tiempo).
export function remainingSeconds(expiresAtSeconds: number, timeSeconds: number): number {
  return Math.max(0, Math.ceil(expiresAtSeconds - timeSeconds));
}

// El texto de una entrada del registro. Cada tipo lleva su símbolo,
// para distinguirlo sin depender del color.
export function logText(entry: LogEntry): string {
  const reason = entry.reason ?? "";
  switch (entry.kind) {
    case "selected":
      return `→ Seleccionada: ${entry.label}`;
    case "selection-rejected":
      return `✗ ${entry.label} → no se pudo seleccionar: ${reason}`;
    case "execute-ordered":
      return `▶ Ejecutar: ${entry.label}`;
    case "cancelled":
      return `⊘ Cancelada: ${entry.label}`;
    case "expired":
      return `⏱ Expiró sin confirmar: ${entry.label}`;
    case "done":
      return `✓ ${entry.label}`;
    case "failed":
      return `✗ ${entry.label} → rechazada: ${reason}`;
  }
}

export function formatPowerOrder(valueMW: number): string {
  return Number.isFinite(valueMW) ? `${formatValue(valueMW, 0)} MW` : "no válido";
}
