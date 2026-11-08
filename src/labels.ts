// Etiquetas en español para mostrar los datos de la estación.
// Las comparten la consola (main.ts) y la web.

import type { ConverterState, OperatingMode } from "./station.ts";
import type { SwitchStatus } from "./switchgear.ts";

export const positionLabels: Record<SwitchStatus["kind"], string> = {
  open: "abierto",
  closed: "cerrado",
  moving: "maniobra",
};

export const converterLabels: Record<ConverterState, string> = {
  blocked: "bloqueado",
  deblocked: "desbloqueado",
};

// Modo de operación, en palabras. El indicador de la pantalla le suma forma y símbolo.
export const modeLabels: Record<OperatingMode, string> = {
  automatic: "automático",
  manual: "manual",
};

export function formatSwitch(status: SwitchStatus): string {
  return positionLabels[status.kind];
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

const pad = (value: number, digits: number) => String(value).padStart(digits, "0");

// Fecha y hora con milisegundos, en hora local (ej. "2026-11-05 14:03:07.123").
export function formatTimestamp(timestampMs: number): string {
  const d = new Date(timestampMs);
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)} ` +
    `${pad(d.getHours(), 2)}:${pad(d.getMinutes(), 2)}:${pad(d.getSeconds(), 2)}.${pad(d.getMilliseconds(), 3)}`
  );
}
