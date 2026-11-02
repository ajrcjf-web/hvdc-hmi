// Etiquetas en español para mostrar los datos de la estación.
// Las comparten la consola (main.ts) y la web.

import type { ConverterState } from "./station.ts";
import type { SwitchStatus } from "./switchgear.ts";

const positionLabels: Record<"open" | "closed", string> = {
  open: "abierto",
  closed: "cerrado",
};

export const converterLabels: Record<ConverterState, string> = {
  blocked: "bloqueado",
  deblocked: "desbloqueado",
};

export function formatSwitch(status: SwitchStatus): string {
  return status.kind === "moving" ? "maniobra" : positionLabels[status.kind];
}

// Los valores calculados acumulan error de redondeo (29.999999999999996):
// para mostrarlos se fijan los decimales.
export function formatValue(value: number, decimals: number): string {
  return value.toFixed(decimals);
}

// La hora simulada, con un decimal (ej. "12.3").
export function formatTime(timeSeconds: number): string {
  return formatValue(timeSeconds, 1);
}
