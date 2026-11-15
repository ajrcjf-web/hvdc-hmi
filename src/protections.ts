// Protecciones y relé de bloqueo 86.
// Una falla (la provoca el instructor) la ve una protección si la mide: está en su zona, la
// zona está energizada y se cumple la condición propia del elemento. Mientras la ve, el
// elemento cuenta tiempo; arranca en el primer ciclo en que la ve y actúa cuando el tiempo
// llega a su tiempo propio más su retardo intencional. Al actuar, enclava el relé 86, que
// bloquea el convertidor al instante y dispara Q1. El relé no se suelta solo: el reset es una
// orden del operador.
// Funciones puras: reciben la estación y devuelven una nueva, más los eventos.

import type { SignalEvent } from "./events.ts";
import { measureAcVoltagePercent } from "./measurements.ts";
import { isZoneEnergized, type MeasurementPoint, type ProtectionZone } from "./protectionZones.ts";
import { describeSignal, type SignalCode } from "./signals.ts";
import { isTimeUp } from "./simulationTime.ts";
import type { Station } from "./station.ts";
import { atOrigin, tripSwitch } from "./switchgear.ts";

// Los elementos de protección. Cada uno vigila una falla; el orden es el de evaluación y el de
// los eventos de un mismo ciclo. La 21 tiene dos zonas y la 27 dos escalones, y cada uno es un
// elemento con su propio ajuste.
export const protectionElements = [
  "distanceZone1",
  "distanceZone2",
  "acUndervoltageStage1",
  "acUndervoltageStage2",
  "transformerDifferential",
  "converterProtection",
] as const;
export type ProtectionElement = (typeof protectionElements)[number];

// Las funciones de protección: lo que el operador reconoce como una protección (una alarma
// urgente por función). La 21 reúne sus dos zonas y la 27, sus dos escalones.
export type ProtectionFunction =
  | "distance"
  | "acUndervoltage"
  | "transformerDifferential"
  | "converterProtection";

export const functionOfElement: Record<ProtectionElement, ProtectionFunction> = {
  distanceZone1: "distance",
  distanceZone2: "distance",
  acUndervoltageStage1: "acUndervoltage",
  acUndervoltageStage2: "acUndervoltage",
  transformerDifferential: "transformerDifferential",
  converterProtection: "converterProtection",
};

// Las fallas que provoca el instructor. No son órdenes: no pasan por los enclavamientos.
// La de línea AC lleva su ubicación (porcentaje del largo de la línea) y la de subtensión, la
// tensión residual (porcentaje de Un).
export type Faults = {
  transformer: boolean;
  converter: boolean;
  acLine: { locationPercent: number } | null;
  acUndervoltage: { residualPercent: number } | null;
};
export type FaultKind = keyof Faults;
// Las fallas que ofrece la ventana del instructor, en el orden en que se muestran (de la red
// hacia la línea DC).
export const faultKinds: FaultKind[] = ["acLine", "acUndervoltage", "transformer", "converter"];

export type Fault =
  | { kind: "transformer" }
  | { kind: "converter" }
  | { kind: "acLine"; locationPercent: number }
  | { kind: "acUndervoltage"; residualPercent: number };

// La ubicación de la falla de línea AC llega hasta el 150 %: más allá del 120 % la 21 no la ve,
// pero la 27 sí (por la tensión residual fija de la línea).
export const MAX_FAULT_LOCATION_PERCENT = 150;

function isPercent(value: number, max: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= max;
}

// ¿Los datos de la falla valen? Una falla con un valor fuera de rango no se provoca.
export function isValidFault(fault: Fault): boolean {
  switch (fault.kind) {
    case "acLine":
      return isPercent(fault.locationPercent, MAX_FAULT_LOCATION_PERCENT);
    case "acUndervoltage":
      return isPercent(fault.residualPercent, 100);
    default:
      return true;
  }
}

export function noFaults(): Faults {
  return { transformer: false, converter: false, acLine: null, acUndervoltage: null };
}

export function isFaultPresent(faults: Faults, kind: FaultKind): boolean {
  return faults[kind] !== false && faults[kind] !== null;
}

// Provoca una falla. Si ya está presente con los mismos datos, o los datos no valen, devuelve
// las mismas fallas (sin cambios); con otros datos, los reemplaza.
export function withFault(faults: Faults, fault: Fault): Faults {
  if (!isValidFault(fault)) return faults;
  switch (fault.kind) {
    case "acLine":
      return faults.acLine?.locationPercent === fault.locationPercent
        ? faults
        : { ...faults, acLine: { locationPercent: fault.locationPercent } };
    case "acUndervoltage":
      return faults.acUndervoltage?.residualPercent === fault.residualPercent
        ? faults
        : { ...faults, acUndervoltage: { residualPercent: fault.residualPercent } };
    case "transformer":
    case "converter":
      return faults[fault.kind] ? faults : { ...faults, [fault.kind]: true };
  }
}

export function withoutFault(faults: Faults, kind: FaultKind): Faults {
  if (!isFaultPresent(faults, kind)) return faults;
  return { ...faults, [kind]: kind === "transformer" || kind === "converter" ? false : null };
}

// El relé de bloqueo 86: uno por estación. `operated` son los elementos que actuaron desde
// el último reset (la causa de que esté enclavado).
export type Relay86 = { locked: boolean; operated: ProtectionElement[] };

export function createRelay86(): Relay86 {
  return { locked: false, operated: [] };
}

// Cuánto tiempo lleva cada elemento viendo su falla (0 si no la ve).
export type ProtectionState = { pickupSeconds: Record<ProtectionElement, number> };

export function createProtectionState(): ProtectionState {
  const pickupSeconds = Object.fromEntries(
    protectionElements.map((element) => [element, 0]),
  ) as Record<ProtectionElement, number>;
  return { pickupSeconds };
}

// Ajustes de un elemento. El tiempo propio es el del relé (no intencional); el retardo es
// el que se le programa a propósito (por ejemplo, la zona 2 de la 21).
export type ProtectionSetting = { operateTimeSeconds: number; delaySeconds: number };

// El disparo de Q1 se expresa en ciclos de la red, y la frecuencia es un dato.
export type ProtectionConfig = {
  gridFrequencyHz: number;
  q1TripCycles: number;
  protectionSettings: Record<ProtectionElement, ProtectionSetting>;
  // Alcance de las zonas de la 21, en porcentaje del largo de la línea AC.
  zone1ReachPercent: number;
  zone2ReachPercent: number;
  // Arranque de los escalones de la 27, en porcentaje de Un (actúa con la tensión por debajo).
  undervoltageStage1PickupPercent: number;
  undervoltageStage2PickupPercent: number;
  // La tensión en TP1 con una falla en la línea AC (0 %: falla franca).
  acLineFaultResidualVoltagePercent: number;
};

export const defaultProtectionConfig: ProtectionConfig = {
  gridFrequencyHz: 50,
  q1TripCycles: 1.5,
  protectionSettings: {
    distanceZone1: { operateTimeSeconds: 0.03, delaySeconds: 0 },
    distanceZone2: { operateTimeSeconds: 0, delaySeconds: 0.3 },
    acUndervoltageStage1: { operateTimeSeconds: 0, delaySeconds: 0.3 },
    acUndervoltageStage2: { operateTimeSeconds: 0.03, delaySeconds: 0 },
    transformerDifferential: { operateTimeSeconds: 0.03, delaySeconds: 0 },
    converterProtection: { operateTimeSeconds: 0.03, delaySeconds: 0 },
  },
  zone1ReachPercent: 80,
  zone2ReachPercent: 120,
  undervoltageStage1PickupPercent: 80,
  undervoltageStage2PickupPercent: 70,
  acLineFaultResidualVoltagePercent: 0,
};

// Tiempo de disparo de Q1: 1,5 ciclos a 50 Hz = 30 ms.
export function q1TripSeconds(config: ProtectionConfig): number {
  return config.q1TripCycles / config.gridFrequencyHz;
}

type ElementDefinition = {
  zone: ProtectionZone | null; // la 27 no tiene zona de falla: mide la tensión de barra
  points: MeasurementPoint[]; // los transformadores de medida que usa
  signal: SignalCode;
  // ¿La falla que vigila está presente y dentro de lo que el elemento detecta? (la causa, sin
  // mirar si la zona está energizada ni si hay corriente)
  causePresent: (station: Station, config: ProtectionConfig) => boolean;
  // ¿La puede medir ahora? La zona energizada y, si el elemento lo pide, algo más.
  energized: (station: Station) => boolean;
};

// La 21 mira hacia la red y necesita corriente por CT1: solo existe si la estación aporta
// (Q1 cerrado y convertidor desbloqueado, aporte del VSC). Con Q1 abierto o el convertidor
// bloqueado no hay corriente por CT1 y no actúa. "Cerrado" usa atOrigin.
function stationFeedsFault(station: Station): boolean {
  return atOrigin(station.switchgear).Q1.kind === "closed" && station.converter === "deblocked";
}

function acLineFaultWithin(station: Station, reachPercent: number): boolean {
  const fault = station.faults.acLine;
  return fault !== null && fault.locationPercent <= reachPercent;
}

export const elementDefinitions: Record<ProtectionElement, ElementDefinition> = {
  distanceZone1: {
    zone: "acLine",
    points: ["CT1", "TP1"],
    signal: "PROT.DISTANCE_Z1",
    causePresent: (station, config) => acLineFaultWithin(station, config.zone1ReachPercent),
    energized: (station) => isZoneEnergized("acLine", station) && stationFeedsFault(station),
  },
  distanceZone2: {
    zone: "acLine",
    points: ["CT1", "TP1"],
    signal: "PROT.DISTANCE_Z2",
    causePresent: (station, config) => acLineFaultWithin(station, config.zone2ReachPercent),
    energized: (station) => isZoneEnergized("acLine", station) && stationFeedsFault(station),
  },
  acUndervoltageStage1: {
    zone: null,
    points: ["TP1"],
    signal: "PROT.UNDERVOLTAGE_S1",
    causePresent: (station, config) =>
      measureAcVoltagePercent(station, config) < config.undervoltageStage1PickupPercent,
    energized: () => true, // TP1 mide la tensión de barra siempre
  },
  acUndervoltageStage2: {
    zone: null,
    points: ["TP1"],
    signal: "PROT.UNDERVOLTAGE_S2",
    causePresent: (station, config) =>
      measureAcVoltagePercent(station, config) < config.undervoltageStage2PickupPercent,
    energized: () => true,
  },
  transformerDifferential: {
    zone: "transformer",
    points: ["CT1", "CT2"],
    signal: "PROT.TRANSFORMER_DIFFERENTIAL",
    causePresent: (station) => station.faults.transformer,
    energized: (station) => isZoneEnergized("transformer", station),
  },
  converterProtection: {
    zone: "converter",
    points: ["CT2", "CT3"],
    signal: "PROT.CONVERTER",
    causePresent: (station) => station.faults.converter,
    energized: (station) => isZoneEnergized("converter", station),
  },
};

// ¿Sigue presente la causa de un elemento? Sirve para rechazar el reset del 86 y para las
// alarmas de protección. No mira si el elemento la puede medir ahora.
export function isCausePresent(
  element: ProtectionElement,
  station: Station,
  config: ProtectionConfig,
): boolean {
  return elementDefinitions[element].causePresent(station, config);
}

// ¿El elemento ve la falla ahora? La causa presente y la mide (zona energizada y su condición).
export function isSeeing(
  element: ProtectionElement,
  station: Station,
  config: ProtectionConfig,
): boolean {
  const definition = elementDefinitions[element];
  return definition.causePresent(station, config) && definition.energized(station);
}

// La alarma "Protección X actuó" de una función: activa mientras algún elemento suyo que actuó
// siga con su causa presente. Se normaliza cuando el instructor despeja la falla.
export function isFunctionAlarmActive(
  fn: ProtectionFunction,
  station: Station,
  config: ProtectionConfig,
): boolean {
  return station.relay86.operated.some(
    (element) => functionOfElement[element] === fn && isCausePresent(element, station, config),
  );
}

// Las causas del 86 enclavado: los elementos que actuaron, con su nombre (el de la tabla de
// señales, para no repetir textos) y si su falla sigue presente. Las usan el reset y la
// ventana de confirmación.
export type Relay86Cause = { element: ProtectionElement; name: string; present: boolean };

export function relay86Causes(station: Station, config: ProtectionConfig): Relay86Cause[] {
  return station.relay86.operated.map((element) => ({
    element,
    name: describeSignal(elementDefinitions[element].signal),
    present: isCausePresent(element, station, config),
  }));
}

// Bloqueo por protección: instantáneo, a diferencia del bloqueo del operador (que exige
// P = 0 y deja bajar Udc con su rampa). P, consigna y Udc pasan a 0 sin rampa.
export function blockByProtection(station: Station): Station {
  return { ...station, converter: "blocked", powerMW: 0, powerOrderMW: 0, udcKV: 0 };
}

export type ProtectionResult = { station: Station; events: SignalEvent[] };

// Evalúa las protecciones durante un ciclo de dtSeconds. Los eventos salen en este orden:
// arranques, disparos de elementos, 86 enclavado y convertidor bloqueado. (Q1 abierto lo
// detecta el ciclo cuando termina el disparo.) Si nada cambió, devuelve la misma estación.
export function evaluateProtections(
  station: Station,
  dtSeconds: number,
  config: ProtectionConfig,
  timeSeconds: number,
): ProtectionResult {
  const pickups: SignalEvent[] = [];
  const operations: SignalEvent[] = [];
  const newlyOperated: ProtectionElement[] = [];
  const pickupSeconds = { ...station.protection.pickupSeconds };
  let counterChanged = false;

  for (const element of protectionElements) {
    const previous = pickupSeconds[element];
    // Un elemento que ya actuó queda enclavado: no vuelve a actuar hasta el reset.
    const seesFault =
      !station.relay86.operated.includes(element) && isSeeing(element, station, config);
    if (!seesFault) {
      if (previous !== 0) {
        pickupSeconds[element] = 0;
        counterChanged = true;
      }
      continue;
    }
    const seconds = previous + dtSeconds;
    pickupSeconds[element] = seconds;
    counterChanged = true;
    const signal = elementDefinitions[element].signal;
    if (previous === 0) {
      pickups.push({ code: signal, state: "picked-up", timeSeconds });
    }
    const setting = config.protectionSettings[element];
    // Se compara con tolerancia (isTimeUp): el tiempo acumulado sumando dt no es exacto.
    if (isTimeUp(setting.operateTimeSeconds + setting.delaySeconds - seconds)) {
      operations.push({ code: signal, state: "operated", timeSeconds });
      newlyOperated.push(element);
    }
  }

  if (!counterChanged) {
    return { station, events: [] };
  }

  let next: Station = { ...station, protection: { pickupSeconds } };
  const events = [...pickups, ...operations];

  if (newlyOperated.length > 0) {
    if (!station.relay86.locked) {
      events.push({ code: "RELAY86.LOCKOUT", state: "locked", timeSeconds });
    }
    next = {
      ...next,
      relay86: { locked: true, operated: [...station.relay86.operated, ...newlyOperated] },
    };
    if (next.converter === "deblocked") {
      events.push({ code: "CONVERTER.BLOCK", state: "blocked", timeSeconds });
    }
    // El disparo de Q1 no pasa por los enclavamientos del operador y tiene prioridad sobre
    // una maniobra de Q1 en curso. Q2 y QE no se ven afectados.
    next = blockByProtection(next);
    next = { ...next, switchgear: tripSwitch(next.switchgear, "Q1", q1TripSeconds(config)) };
  }

  return { station: next, events };
}
