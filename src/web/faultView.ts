// Qué se muestra de las fallas en la ventana del instructor. Funciones puras: solo preparan
// textos y datos; el componente los pone en pantalla.

import { describeSignal, describeSignalState } from "../signals.ts";
import { elementDefinitions, faultKinds, type FaultKind, type ProtectionElement } from "../protections.ts";
import { isZoneEnergized, type ProtectionZone } from "../protectionZones.ts";
import type { Station } from "../station.ts";
import { deriveState } from "../stationState.ts";

type FaultInfo = { name: string; zone: ProtectionZone; zoneLabel: string; element: ProtectionElement };

const faultInfo: Record<FaultKind, FaultInfo> = {
  transformer: {
    name: "Falla interna del transformador",
    zone: "transformer",
    zoneLabel: "zona del transformador (CT1–CT2)",
    element: "transformerDifferential",
  },
  converter: {
    name: "Falla interna del convertidor",
    zone: "converter",
    zoneLabel: "zona del convertidor (CT2–CT3)",
    element: "converterProtection",
  },
};

export type FaultRow = {
  kind: FaultKind;
  name: string;
  present: boolean;
  stateLabel: string;
  // Cómo queda la falla frente a las protecciones: vacío si no está presente.
  note: string;
};

export function toFaultRows(station: Station): FaultRow[] {
  return faultKinds.map((kind) => {
    const info = faultInfo[kind];
    const present = station.faults[kind];
    const protection = describeSignal(elementDefinitions[info.element].signal);
    let note = "";
    if (present) {
      note = isZoneEnergized(info.zone, station)
        ? `La ve: ${protection}`
        : `La ${info.zoneLabel} está sin energizar: ninguna protección la ve; ${protection} actuará cuando se energice`;
    }
    return {
      kind,
      name: info.name,
      present,
      stateLabel: present ? "Falla presente" : "Falla despejada",
      note,
    };
  });
}

// Lo que el instructor necesita ver de la estación al provocar una falla: el estado y el 86.
export function summarizeStation(station: Station): string {
  const state = describeSignalState(deriveState(station.switchgear));
  const relay = station.relay86.locked ? "enclavado" : "normal";
  return `Estación: ${state} · Relé 86: ${relay}`;
}
