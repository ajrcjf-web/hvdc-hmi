// La estación: equipos, convertidor, tensión, potencia y órdenes del operador.
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
  describeMovingSwitches,
  requestSwitch,
  switchIds,
  type SwitchId,
  type SwitchTarget,
  type Switchgear,
  type SwitchgearConfig,
} from "./switchgear.ts";

export type ConverterState = "blocked" | "deblocked";

// Modo de operación: en automático el operador da órdenes de estado (requestTransition);
// en manual da órdenes por equipo (requestSwitchOrder). Cada modo rechaza las del otro.
export type OperatingMode = "automatic" | "manual";

export type Station = {
  mode: OperatingMode;
  switchgear: Switchgear;
  converter: ConverterState;
  udcKV: number; // tensión DC (tiene dinámica: sube y baja con su rampa)
  powerMW: number; // potencia medida
  powerOrderMW: number; // consigna del operador
};

export type StationConfig = SwitchgearConfig & {
  pMinMW: number;
  pMaxMW: number;
  rampRateMWPerMin: number;
  ratedVoltageKV: number;
  voltageRampKVPerS: number;
};

export const defaultConfig: StationConfig = {
  ...defaultSwitchgearConfig,
  pMinMW: 50,
  pMaxMW: 500,
  rampRateMWPerMin: 600,
  ratedVoltageKV: 500,
  voltageRampKVPerS: 100,
};

export type CommandResult =
  | { ok: true; station: Station }
  | { ok: false; reason: string };

export function createStation(): Station {
  return {
    mode: "automatic",
    switchgear: switchgearFor("stopped"),
    converter: "blocked",
    udcKV: 0,
    powerMW: 0,
    powerOrderMW: 0,
  };
}

// La tensión hacia la que va Udc: nominal con el convertidor desbloqueado, 0 bloqueado.
export function targetUdcKV(station: Station, config: StationConfig): number {
  return station.converter === "deblocked" ? config.ratedVoltageKV : 0;
}

function isRamping(station: Station, config: StationConfig): boolean {
  return (
    station.powerMW !== station.powerOrderMW ||
    station.udcKV !== targetUdcKV(station, config)
  );
}

function reject(reason: string): CommandResult {
  return { ok: false, reason };
}

// El motivo cuando hay una maniobra en curso: dice qué equipo se mueve,
// en qué sentido y cuánto falta.
function transitionReason(station: Station): string {
  const moving = describeMovingSwitches(station.switchgear);
  return `La estación está en transición: ${moving ?? "hay una maniobra en curso"}`;
}

// Maniobra de un equipo con TODOS sus enclavamientos. Es la única función que ordena una
// maniobra: la comparten las órdenes públicas (requestTransition y requestSwitchOrder),
// y así los enclavamientos viven en un solo lugar. No mira el modo de operación: eso lo
// decide cada orden pública antes de llamarla. No se exporta, para que nada la use
// saltándose esa verificación.
//
// Enclavamientos de la estación: sin rampas, convertidor bloqueado y P = 0.
// Los de los equipos (QE, Q1 y Q2 entre sí, equipo en maniobra) los aplica requestSwitch.
function operateSwitch(
  station: Station,
  id: SwitchId,
  to: SwitchTarget,
  config: StationConfig,
): CommandResult {
  if (isRamping(station, config)) {
    return reject("No se puede maniobrar durante una rampa de potencia o de tensión");
  }
  if (station.converter === "deblocked") {
    return reject(`${id} no puede maniobrar con el convertidor desbloqueado: bloquear primero`);
  }
  if (station.powerMW !== 0) {
    return reject(
      `${id} no puede maniobrar con corriente: P debe ser 0 (P actual: ${station.powerMW} MW)`,
    );
  }

  const result = requestSwitch(station.switchgear, id, to, config);
  if (!result.ok) {
    return reject(result.reason);
  }
  return { ok: true, station: { ...station, switchgear: result.switchgear } };
}

// Orden de cambio de modo. Se rechaza si ya está en ese modo, si hay una maniobra en curso
// o si hay una rampa de potencia o de tensión: cambiar de mando a mitad de una maniobra
// deja dudas sobre quién la controla. No exige un estado concreto: desde inconsistent se
// puede pasar a manual, que es justo lo que hace falta para normalizar la estación.
export function requestMode(
  station: Station,
  to: OperatingMode,
  config: StationConfig,
): CommandResult {
  if (station.mode === to) {
    return reject(`La estación ya está en modo ${to === "manual" ? "manual" : "automático"}`);
  }
  if (deriveState(station.switchgear) === "transition") {
    return reject(`${transitionReason(station)}. Esperar a que terminen las maniobras`);
  }
  if (isRamping(station, config)) {
    return reject("No se puede cambiar de modo durante una rampa de potencia o de tensión");
  }
  return { ok: true, station: { ...station, mode: to } };
}

// Orden de estado: lleva la estación a un estado vecino con la maniobra de un equipo.
// Solo en modo automático.
export function requestTransition(
  station: Station,
  to: StationState,
  config: StationConfig,
): CommandResult {
  if (station.mode !== "automatic") {
    return reject("Las órdenes de estado solo se aceptan en modo automático");
  }
  const from = deriveState(station.switchgear);

  if (from === "transition") {
    return reject(`${transitionReason(station)}. Esperar a que terminen las maniobras`);
  }
  if (from === "inconsistent") {
    return reject("Posiciones de equipos inconsistentes: no se aceptan órdenes de estado");
  }
  if (!canTransition(from, to)) {
    return reject(`Transición no permitida: ${from} → ${to}`);
  }

  const target = statePositions[to];
  const current = statePositions[from];
  const id = switchIds.find((switchId) => current[switchId] !== target[switchId]);

  if (id === undefined) {
    return reject(`No hay maniobra definida para ${from} → ${to}`);
  }
  return operateSwitch(station, id, target[id], config);
}

// Orden por equipo: abrir o cerrar Q1, Q2 o QE. Con los mismos enclavamientos que la
// orden de estado. Solo en modo manual.
export function requestSwitchOrder(
  station: Station,
  id: SwitchId,
  to: SwitchTarget,
  config: StationConfig,
): CommandResult {
  if (station.mode !== "manual") {
    return reject("Las órdenes por equipo solo se aceptan en modo manual");
  }
  return operateSwitch(station, id, to, config);
}

export function requestDeblock(station: Station): CommandResult {
  const state = deriveState(station.switchgear);
  if (state === "transition") {
    return reject(transitionReason(station));
  }
  if (state !== "coupled") {
    return reject(`Solo se puede desbloquear en coupled (estado actual: ${state})`);
  }
  if (station.converter === "deblocked") {
    return reject("El convertidor ya está desbloqueado");
  }
  return { ok: true, station: { ...station, converter: "deblocked" } };
}

export function requestBlock(station: Station): CommandResult {
  if (station.converter === "blocked") {
    return reject("El convertidor ya está bloqueado");
  }
  if (station.powerMW !== 0 || station.powerOrderMW !== 0) {
    return reject(
      `Para bloquear, P y la consigna deben ser 0 (P actual: ${station.powerMW} MW, consigna: ${station.powerOrderMW} MW)`,
    );
  }
  return { ok: true, station: { ...station, converter: "blocked" } };
}

export function requestPowerOrder(
  station: Station,
  orderMW: number,
  config: StationConfig,
): CommandResult {
  const state = deriveState(station.switchgear);
  if (state === "transition") {
    return reject(transitionReason(station));
  }
  if (state !== "coupled") {
    return reject(`Solo se puede dar consigna en coupled (estado actual: ${state})`);
  }
  if (station.converter !== "deblocked") {
    return reject("Desbloquear el convertidor antes de dar consigna");
  }
  if (station.udcKV !== config.ratedVoltageKV) {
    return reject(
      `Esperar a que Udc alcance el valor nominal (Udc actual: ${station.udcKV} kV)`,
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
