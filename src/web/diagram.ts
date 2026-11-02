// Traducción del estado de la estación a cómo se dibuja el unifilar.
// Función pura: no sabe nada de SVG ni de colores; solo dice qué se ve.

import type { ConverterState, Station } from "../station.ts";
import { deriveState, type DerivedState } from "../stationState.ts";
import type { SwitchId, SwitchStatus, SwitchTarget } from "../switchgear.ts";
import { measure } from "../measurements.ts";

export type SwitchPosition = SwitchStatus["kind"]; // "open" | "closed" | "moving"

export type SwitchView = {
  position: SwitchPosition;
  movingTo: SwitchTarget | null; // hacia dónde va, solo durante la maniobra
};

// Un tramo del dibujo está con tensión ("live") o sin ella ("dead").
export type Energization = "live" | "dead";

export type DiagramModel = {
  state: DerivedState;
  switches: Record<SwitchId, SwitchView>;
  converter: ConverterState;
  segments: {
    acGrid: Energization; // de la red AC a Q1
    acStation: Energization; // de Q1 al convertidor: transformador y lado AC
    dcStation: Energization; // del convertidor a Q2 (donde conecta QE)
    dcLine: Energization; // de Q2 a la línea DC
  };
  // Verdadero solo en la situación "inconsistent": las posiciones de los equipos
  // no corresponden a ningún estado. "transition" (maniobra en curso) es normal.
  abnormal: boolean;
  readings: { powerMW: number; udcKV: number; idcKA: number }; // sin redondear
};

function viewOf(status: SwitchStatus): SwitchView {
  return {
    position: status.kind,
    movingTo: status.kind === "moving" ? status.to : null,
  };
}

function energization(isLive: boolean): Energization {
  return isLive ? "live" : "dead";
}

export function describeDiagram(station: Station): DiagramModel {
  const { Q1, Q2, QE } = station.switchgear;
  const state = deriveState(station.switchgear);
  const { udcKV, idcKA } = measure(station);

  // Un equipo en maniobra no cuenta como cerrado: solo cuenta "closed".
  const q1Closed = Q1.kind === "closed";
  const q2Closed = Q2.kind === "closed";

  return {
    state,
    switches: { Q1: viewOf(Q1), Q2: viewOf(Q2), QE: viewOf(QE) },
    converter: station.converter,
    segments: {
      acGrid: "live",
      acStation: energization(q1Closed),
      dcStation: energization(udcKV > 0),
      dcLine: energization(q2Closed && udcKV > 0),
    },
    abnormal: state === "inconsistent",
    readings: { powerMW: station.powerMW, udcKV, idcKA },
  };
}
