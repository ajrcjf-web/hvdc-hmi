// La estación: equipos, potencia y órdenes del operador.
// El estado no se guarda: se deduce de las posiciones de los equipos.
// Cada orden devuelve una estación nueva, o un rechazo con motivo.

import {
  canTransition,
  deriveState,
  statePositions,
  switchgearFor,
  type StationState,
} from "./stationState.ts";
import {
  defaultSwitchgearConfig,
  requestSwitch,
  switchIds,
  type Switchgear,
  type SwitchgearConfig,
} from "./switchgear.ts";

export type Station = {
  switchgear: Switchgear;
  powerMW: number; // potencia medida
  powerOrderMW: number; // consigna del operador
};

export type StationConfig = SwitchgearConfig & {
  pMinMW: number;
  pMaxMW: number;
  rampRateMWPerMin: number;
  ratedVoltageKV: number;
};

export const defaultConfig: StationConfig = {
  ...defaultSwitchgearConfig,
  pMinMW: 50,
  pMaxMW: 500,
  rampRateMWPerMin: 600,
  ratedVoltageKV: 500,
};

export type CommandResult =
  | { ok: true; station: Station }
  | { ok: false; reason: string };

export function createStation(): Station {
  return { switchgear: switchgearFor("stopped"), powerMW: 0, powerOrderMW: 0 };
}

function reject(reason: string): CommandResult {
  return { ok: false, reason };
}

export function requestTransition(
  station: Station,
  to: StationState,
  config: StationConfig,
): CommandResult {
  const from = deriveState(station.switchgear);

  if (from === "transition") {
    return reject("La estación está en transición: esperar a que terminen las maniobras");
  }
  if (from === "inconsistent") {
    return reject("Posiciones de equipos inconsistentes: no se aceptan órdenes de estado");
  }
  if (!canTransition(from, to)) {
    return reject(`Transición no permitida: ${from} → ${to}`);
  }
  if (station.powerMW !== station.powerOrderMW) {
    return reject("No se puede cambiar de estado durante una rampa de potencia");
  }

  const target = statePositions[to];
  const current = statePositions[from];
  const id = switchIds.find((switchId) => current[switchId] !== target[switchId]);

  if (id === undefined) {
    return reject(`No hay maniobra definida para ${from} → ${to}`);
  }
  if (id === "Q2" && station.powerMW !== 0) {
    return reject(
      `Q2 no puede maniobrar con corriente: P debe ser 0 (P actual: ${station.powerMW} MW)`,
    );
  }

  const result = requestSwitch(station.switchgear, id, target[id], config);
  if (!result.ok) {
    return reject(result.reason);
  }
  return { ok: true, station: { ...station, switchgear: result.switchgear } };
}

export function requestPowerOrder(
  station: Station,
  orderMW: number,
  config: StationConfig,
): CommandResult {
  const state = deriveState(station.switchgear);
  if (state !== "coupled") {
    return reject(`Solo se puede dar consigna en coupled (estado actual: ${state})`);
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
