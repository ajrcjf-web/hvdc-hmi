// Qué se muestra de las fallas en la ventana del instructor. Funciones puras: solo preparan
// textos y datos; el componente los pone en pantalla.

import {
  elementDefinitions,
  faultKinds,
  isCausePresent,
  isFaultPresent,
  isSeeing,
  isValidFault,
  MAX_FAULT_LOCATION_PERCENT,
  type Fault,
  type FaultKind,
  type ProtectionElement,
} from "../protections.ts";
import { isZoneEnergized, type ProtectionZone } from "../protectionZones.ts";
import { describeSignal, describeSignalState } from "../signals.ts";
import type { Station, StationConfig } from "../station.ts";
import { deriveState } from "../stationState.ts";

type ZoneFaultInfo = {
  name: string;
  zone: ProtectionZone;
  zoneLabel: string;
  element: ProtectionElement;
};

// Las fallas internas de un equipo: una zona y un elemento que la vigila.
const zoneFaults: Record<"transformer" | "converter", ZoneFaultInfo> = {
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

const faultNames: Record<FaultKind, string> = {
  acLine: "Falla en la línea AC",
  acUndervoltage: "Subtensión en la red AC",
  transformer: zoneFaults.transformer.name,
  converter: zoneFaults.converter.name,
};

// Los elementos que reaccionan a cada falla de la red. La falla de línea AC también baja la
// tensión en TP1 (una residual fija), así que la ven también los escalones de la 27.
const networkFaultElements: Record<"acLine" | "acUndervoltage", ProtectionElement[]> = {
  acLine: ["distanceZone1", "distanceZone2", "acUndervoltageStage1", "acUndervoltageStage2"],
  acUndervoltage: ["acUndervoltageStage1", "acUndervoltageStage2"],
};

// El dato que el instructor da al provocar una falla (ubicación o tensión residual).
export type FaultParameter = {
  label: string;
  min: number;
  max: number;
  defaultText: string;
  hint: string; // qué protecciones lo ven según el valor
};

export type FaultRow = {
  kind: FaultKind;
  name: string;
  present: boolean;
  stateLabel: string;
  // Cómo queda la falla frente a las protecciones: vacío si no está presente.
  note: string;
  parameter: FaultParameter | null;
};

function parameterFor(kind: FaultKind, config: StationConfig): FaultParameter | null {
  switch (kind) {
    case "acLine":
      return {
        label: "Ubicación (% del largo de la línea)",
        min: 0,
        max: MAX_FAULT_LOCATION_PERCENT,
        defaultText: "50",
        hint: `La 21 ve hasta el ${config.zone1ReachPercent} % (zona 1) y hasta el ${config.zone2ReachPercent} % (zona 2); más allá solo la ve la 27`,
      };
    case "acUndervoltage":
      return {
        label: "Tensión residual (% de Un)",
        min: 0,
        max: 100,
        defaultText: "50",
        hint: `27: escalón 1 por debajo de ${config.undervoltageStage1PickupPercent} %, escalón 2 por debajo de ${config.undervoltageStage2PickupPercent} %`,
      };
    default:
      return null;
  }
}

// Convierte lo que el instructor escribió en la falla a provocar. Devuelve null si el valor no
// es un número o está fuera de rango. Las fallas sin dato siempre valen.
export function faultFromInput(kind: FaultKind, text: string): Fault | null {
  let fault: Fault;
  switch (kind) {
    case "acLine":
      fault = { kind, locationPercent: text.trim() === "" ? Number.NaN : Number(text) };
      break;
    case "acUndervoltage":
      fault = { kind, residualPercent: text.trim() === "" ? Number.NaN : Number(text) };
      break;
    default:
      fault = { kind };
  }
  return isValidFault(fault) ? fault : null;
}

const names = (elements: ProtectionElement[]): string =>
  elements.map((element) => describeSignal(elementDefinitions[element].signal)).join("; ");

// La nota de una falla de la red: qué protecciones ya actuaron, cuáles la ven y cuáles no.
function networkFaultNote(
  kind: "acLine" | "acUndervoltage",
  station: Station,
  config: StationConfig,
): string {
  const fault = station.faults[kind];
  const lead =
    kind === "acLine"
      ? `Ubicación: ${station.faults.acLine?.locationPercent} % de la línea`
      : `Tensión residual: ${station.faults.acUndervoltage?.residualPercent} % de Un`;
  if (fault === null) return "";

  // Solo cuentan los elementos que reaccionarían a esta falla (su causa está presente).
  const relevant = networkFaultElements[kind].filter((e) => isCausePresent(e, station, config));
  if (relevant.length === 0) {
    return `${lead}. Ninguna protección de esta estación la ve: está fuera de su alcance`;
  }
  const operated = relevant.filter((e) => station.relay86.operated.includes(e));
  const pending = relevant.filter((e) => !operated.includes(e));
  const seeing = pending.filter((e) => isSeeing(e, station, config));
  const blind = pending.filter((e) => !isSeeing(e, station, config));

  const parts = [lead];
  if (operated.length > 0) parts.push(`Ya actuó: ${names(operated)}`);
  if (seeing.length > 0) parts.push(`La ve: ${names(seeing)}`);
  if (blind.length > 0) {
    // Solo la 21 puede no verla: necesita corriente por CT1 (la 27 mide siempre).
    parts.push(
      `Sin corriente por CT1 (la 21 necesita Q1 cerrado y el convertidor desbloqueado): ${names(blind)} actuará cuando la haya`,
    );
  }
  return parts.join(". ");
}

// La nota de una falla interna de un equipo (transformador o convertidor).
function zoneFaultNote(kind: "transformer" | "converter", station: Station): string {
  const info = zoneFaults[kind];
  const protection = describeSignal(elementDefinitions[info.element].signal);
  const energized = isZoneEnergized(info.zone, station);
  if (station.relay86.operated.includes(info.element)) {
    // Ya actuó (y el disparo suele dejar la zona sin energizar): no "actuará".
    return `${protection} ya actuó${energized ? "" : ` y la ${info.zoneLabel} quedó sin energizar`}`;
  }
  return energized
    ? `La ve: ${protection}`
    : `La ${info.zoneLabel} está sin energizar: ninguna protección la ve; ${protection} actuará cuando se energice`;
}

export function toFaultRows(station: Station, config: StationConfig): FaultRow[] {
  return faultKinds.map((kind) => {
    const present = isFaultPresent(station.faults, kind);
    let note = "";
    if (present) {
      note =
        kind === "transformer" || kind === "converter"
          ? zoneFaultNote(kind, station)
          : networkFaultNote(kind, station, config);
    }
    return {
      kind,
      name: faultNames[kind],
      present,
      stateLabel: present ? "Falla presente" : "Falla despejada",
      note,
      parameter: parameterFor(kind, config),
    };
  });
}

// Lo que el instructor necesita ver de la estación al provocar una falla: el estado y el 86.
export function summarizeStation(station: Station): string {
  const state = describeSignalState(deriveState(station.switchgear));
  const relay = station.relay86.locked ? "enclavado" : "normal";
  return `Estación: ${state} · Relé 86: ${relay}`;
}
