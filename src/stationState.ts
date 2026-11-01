// Estados de la estación: cuáles existen, cómo se pasa de uno a otro,
// y cómo se reconocen a partir de las posiciones de los equipos.

import type { SwitchTarget, Switchgear, SwitchId } from "./switchgear.ts";

export const stationStates = ["earthed", "stopped", "decoupled", "coupled"] as const;
export type StationState = (typeof stationStates)[number];

// Lo que se deduce de los equipos: un estado, o una situación sin estado.
export type DerivedState = StationState | "transition" | "inconsistent";

// Lista blanca: para cada estado, a cuáles se puede pasar.
const allowedTransitions: Record<StationState, StationState[]> = {
  earthed: ["stopped"],
  stopped: ["earthed", "decoupled"],
  decoupled: ["stopped", "coupled"],
  coupled: ["decoupled"],
};

export function canTransition(from: StationState, to: StationState): boolean {
  return allowedTransitions[from].includes(to);
}

// Posición de cada equipo en cada estado.
export const statePositions: Record<StationState, Record<SwitchId, SwitchTarget>> = {
  earthed: { Q1: "open", Q2: "open", QE: "closed" },
  stopped: { Q1: "open", Q2: "open", QE: "open" },
  decoupled: { Q1: "closed", Q2: "open", QE: "open" },
  coupled: { Q1: "closed", Q2: "closed", QE: "open" },
};

// Los equipos tal como están en un estado, sin maniobras en curso.
export function switchgearFor(state: StationState): Switchgear {
  const positions = statePositions[state];
  return {
    Q1: { kind: positions.Q1 },
    Q2: { kind: positions.Q2 },
    QE: { kind: positions.QE },
  };
}

export function deriveState(switchgear: Switchgear): DerivedState {
  const { Q1, Q2, QE } = switchgear;

  if (Q1.kind === "moving" || Q2.kind === "moving" || QE.kind === "moving") {
    return "transition";
  }

  for (const state of stationStates) {
    const positions = statePositions[state];
    if (Q1.kind === positions.Q1 && Q2.kind === positions.Q2 && QE.kind === positions.QE) {
      return state;
    }
  }

  return "inconsistent";
}
