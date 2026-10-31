// La estación: datos que cambian en el tiempo y órdenes del operador.
// Cada orden devuelve una estación nueva, o un rechazo con motivo.
// Nunca modifica la estación que recibe.

import { canTransition, type StationState } from "./stationState.ts";

export type Station = {
  state: StationState;
  powerMW: number; // potencia medida
  powerOrderMW: number; // consigna del operador
};

export type StationConfig = {
  pMinMW: number;
  pMaxMW: number;
};

export const defaultConfig: StationConfig = {
  pMinMW: 50,
  pMaxMW: 500,
};

export type CommandResult =
  | { ok: true; station: Station }
  | { ok: false; reason: string };

export function createStation(): Station {
  return { state: "stopped", powerMW: 0, powerOrderMW: 0 };
}

function reject(reason: string): CommandResult {
  return { ok: false, reason };
}

export function requestTransition(
  station: Station,
  to: StationState,
): CommandResult {
  const from = station.state;

  if (!canTransition(from, to)) {
    return reject(`Transición no permitida: ${from} → ${to}`);
  }
  if (station.powerMW !== station.powerOrderMW) {
    return reject("No se puede cambiar de estado durante una rampa de potencia");
  }
  if (from === "coupled" && station.powerMW !== 0) {
    return reject(`Para desacoplar, P debe ser 0 (P actual: ${station.powerMW} MW)`);
  }

  return { ok: true, station: { ...station, state: to } };
}

export function requestPowerOrder(
  station: Station,
  orderMW: number,
  config: StationConfig,
): CommandResult {
  if (station.state !== "coupled") {
    return reject(
      `Solo se puede dar consigna en coupled (estado actual: ${station.state})`,
    );
  }
  if (!Number.isFinite(orderMW)) {
    return reject("La consigna debe ser un número válido");
  }

  const isZero = orderMW === 0;
  const isInRange = orderMW >= config.pMinMW && orderMW <= config.pMaxMW;
  if (!isZero && !isInRange) {
    return reject(
      `Consigna fuera de rango: debe ser 0 o estar entre ${config.pMinMW} y ${config.pMaxMW} MW`,
    );
  }

  return { ok: true, station: { ...station, powerOrderMW: orderMW } };
}
