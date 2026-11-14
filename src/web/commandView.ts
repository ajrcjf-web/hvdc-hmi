// Qué se muestra de una orden en la ventana de confirmación. Funciones puras:
// solo preparan textos y datos; los componentes los ponen en pantalla.

import { formatSwitch, formatValue } from "../labels.ts";
import { wholeSecondsLeft } from "../simulationTime.ts";
import type { OperatingMode, Station, StationConfig } from "../station.ts";
import type { SwitchId, SwitchTarget } from "../switchgear.ts";
import { deriveState, type DerivedState } from "../stationState.ts";
import { commandLabel, runCommand, type OperatorCommand } from "./commands.ts";

export type CommandView = {
  title: string;
  current: {
    state: DerivedState;
    mode: OperatingMode;
    converter: Station["converter"];
    powerMW: number;
    powerOrderMW: number;
  };
  expected: string; // resultado esperado, en palabras
  powerOrder: { currentMW: number; newMW: number } | null; // solo para la consigna
  switchOrder: { id: SwitchId; position: string; to: SwitchTarget } | null; // solo para el mando por equipo
  modeChange: { from: OperatingMode; to: OperatingMode } | null; // solo para el cambio de modo
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
    case "mode":
      return `La estación pasará a modo ${command.to === "manual" ? "manual" : "automático"}`;
    case "switch":
      return `${command.id} ${command.to === "open" ? "se abrirá" : "se cerrará"}`;
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
      mode: station.mode,
      converter: station.converter,
      powerMW: station.powerMW,
      powerOrderMW: station.powerOrderMW,
    },
    expected: expectedOutcome(command, station, config),
    powerOrder:
      command.kind === "powerOrder"
        ? { currentMW: station.powerOrderMW, newMW: command.orderMW }
        : null,
    switchOrder:
      command.kind === "switch"
        ? {
            id: command.id,
            position: formatSwitch(station.switchgear[command.id]),
            to: command.to,
          }
        : null,
    modeChange: command.kind === "mode" ? { from: station.mode, to: command.to } : null,
    check: result.ok ? { ok: true } : { ok: false, reason: result.reason },
  };
}

// Segundos que faltan para que expire la selección, redondeados hacia arriba
// (así nunca se muestra 0 mientras queda algo de tiempo) y sin sumar un segundo por
// el error de redondeo del tiempo acumulado.
export function remainingSeconds(expiresAtSeconds: number, timeSeconds: number): number {
  return wholeSecondsLeft(expiresAtSeconds - timeSeconds);
}

// Los dos botones de la ventana de confirmación.
export type ConfirmationButton = "execute" | "cancel";

// Qué hace Enter, dicho con texto (además del anillo de foco): activa el botón que tiene el
// foco. Así se distingue si Enter va a ejecutar o a cancelar sin depender solo del anillo.
export function enterHint(focused: ConfirmationButton | null): string {
  switch (focused) {
    case "execute":
      return "Con Enter: Ejecutar";
    case "cancel":
      return "Con Enter: Cancelar";
    case null:
      return "";
  }
}

export function formatPowerOrder(valueMW: number): string {
  return Number.isFinite(valueMW) ? `${formatValue(valueMW, 0)} MW` : "no válido";
}
