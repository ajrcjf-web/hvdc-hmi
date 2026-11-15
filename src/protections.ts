// Protecciones y relé de bloqueo 86.
// Una falla (la provoca el instructor) la ve una protección si la mide: está en su zona y
// la zona está energizada. Mientras la ve, el elemento cuenta tiempo; arranca en el primer
// ciclo en que la ve y actúa cuando el tiempo llega a su tiempo propio más su retardo
// intencional. Al actuar, enclava el relé 86, que bloquea el convertidor al instante y
// dispara Q1. El relé no se suelta solo: el reset es una orden del operador (otro PR).
// Funciones puras: reciben la estación y devuelven una nueva, más los eventos.

import type { SignalEvent } from "./events.ts";
import { isZoneEnergized, type MeasurementPoint, type ProtectionZone } from "./protectionZones.ts";
import type { SignalCode } from "./signals.ts";
import { isTimeUp } from "./simulationTime.ts";
import type { Station } from "./station.ts";
import { tripSwitch } from "./switchgear.ts";

// Los elementos de protección. Cada uno vigila una falla en una zona.
export const protectionElements = ["transformerDifferential", "converterProtection"] as const;
export type ProtectionElement = (typeof protectionElements)[number];

// Las fallas que provoca el instructor. No son órdenes: no pasan por los enclavamientos.
export type Faults = { transformer: boolean; converter: boolean };
export type FaultKind = keyof Faults;
export type Fault = { kind: FaultKind };

export function noFaults(): Faults {
  return { transformer: false, converter: false };
}

export function withFault(faults: Faults, fault: Fault): Faults {
  return faults[fault.kind] ? faults : { ...faults, [fault.kind]: true };
}

export function withoutFault(faults: Faults, kind: FaultKind): Faults {
  return faults[kind] ? { ...faults, [kind]: false } : faults;
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
  return { pickupSeconds: { transformerDifferential: 0, converterProtection: 0 } };
}

// Ajustes de un elemento. El tiempo propio es el del relé (no intencional); el retardo es
// el que se le programa a propósito (por ejemplo, la zona 2 de la 21).
export type ProtectionSetting = { operateTimeSeconds: number; delaySeconds: number };

// El disparo de Q1 se expresa en ciclos de la red, y la frecuencia es un dato.
export type ProtectionConfig = {
  gridFrequencyHz: number;
  q1TripCycles: number;
  protectionSettings: Record<ProtectionElement, ProtectionSetting>;
};

export const defaultProtectionConfig: ProtectionConfig = {
  gridFrequencyHz: 50,
  q1TripCycles: 1.5,
  protectionSettings: {
    transformerDifferential: { operateTimeSeconds: 0.03, delaySeconds: 0 },
    converterProtection: { operateTimeSeconds: 0.03, delaySeconds: 0 },
  },
};

// Tiempo de disparo de Q1: 1,5 ciclos a 50 Hz = 30 ms.
export function q1TripSeconds(config: ProtectionConfig): number {
  return config.q1TripCycles / config.gridFrequencyHz;
}

type ElementDefinition = {
  zone: ProtectionZone;
  points: MeasurementPoint[]; // los transformadores de medida que usa
  signal: SignalCode;
  // ¿La falla que vigila está presente? (la causa, sin mirar si la zona está energizada)
  causePresent: (faults: Faults) => boolean;
  // ¿La puede medir ahora? La zona energizada y, si el elemento lo pide, algo más.
  energized: (station: Station) => boolean;
};

export const elementDefinitions: Record<ProtectionElement, ElementDefinition> = {
  transformerDifferential: {
    zone: "transformer",
    points: ["CT1", "CT2"],
    signal: "PROT.TRANSFORMER_DIFFERENTIAL",
    causePresent: (faults) => faults.transformer,
    energized: (station) => isZoneEnergized("transformer", station),
  },
  converterProtection: {
    zone: "converter",
    points: ["CT2", "CT3"],
    signal: "PROT.CONVERTER",
    causePresent: (faults) => faults.converter,
    energized: (station) => isZoneEnergized("converter", station),
  },
};

// ¿Sigue presente la causa de un elemento? Sirve para rechazar el reset del 86.
export function isCausePresent(element: ProtectionElement, station: Station): boolean {
  return elementDefinitions[element].causePresent(station.faults);
}

function sees(element: ProtectionElement, station: Station): boolean {
  const definition = elementDefinitions[element];
  return definition.causePresent(station.faults) && definition.energized(station);
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
    const seesFault = !station.relay86.operated.includes(element) && sees(element, station);
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
