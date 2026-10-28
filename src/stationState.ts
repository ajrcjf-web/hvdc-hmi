// Modelo de estados de la estación y transiciones permitidas.
// Este módulo solo define y exporta: no imprime ni arranca nada.

export type StationState = "earthed" | "stopped" | "decoupled" | "coupled";

// Lista blanca: para cada estado, a cuáles se puede pasar.
// No se exporta: el resto del programa debe usar canTransition.
const allowedTransitions: Record<StationState, StationState[]> = {
  earthed: ["stopped"],
  stopped: ["earthed", "decoupled"],
  decoupled: ["stopped", "coupled"],
  coupled: ["decoupled"],
};

export function canTransition(from: StationState, to: StationState): boolean {
  return allowedTransitions[from].includes(to);
}
// Resultado de una orden: o se ejecutó (con el nuevo estado),
// o se rechazó (con el motivo). Nunca las dos cosas.
export type TransitionResult =
  | { ok: true; state: StationState }
  | { ok: false; reason: string };

export function requestTransition(
  from: StationState,
  to: StationState,
): TransitionResult {
  if (!canTransition(from, to)) {
    return {
      ok: false,
      reason: `Transición no permitida: ${from} → ${to}`,
    };
  }
  return { ok: true, state: to };
}
