// Aparamenta: interruptores y seccionadores de la estación, con sus
// posiciones, tiempos de maniobra y enclavamientos.
// Funciones puras: reciben la aparamenta y devuelven una nueva.

export type SwitchId = "Q1" | "Q2" | "QE";
// Q1: interruptor AC. Q2: seccionador DC. QE: seccionador de puesta a tierra.

export type SwitchTarget = "open" | "closed";

export type SwitchStatus =
  | { kind: "open" }
  | { kind: "closed" }
  | { kind: "moving"; to: SwitchTarget; remainingSeconds: number };

export type Switchgear = Record<SwitchId, SwitchStatus>;

export type SwitchgearConfig = {
  operatingTimeSeconds: Record<SwitchId, number>;
};

export const defaultSwitchgearConfig: SwitchgearConfig = {
  operatingTimeSeconds: { Q1: 1, Q2: 8, QE: 6 },
};

export type SwitchCommandResult =
  | { ok: true; switchgear: Switchgear }
  | { ok: false; reason: string };

const targetLabels: Record<SwitchTarget, string> = {
  open: "abierto",
  closed: "cerrado",
};

export function createSwitchgear(): Switchgear {
  return { Q1: { kind: "open" }, Q2: { kind: "open" }, QE: { kind: "open" } };
}

// Solo "abierto" cuenta como abierto: un equipo en maniobra no es seguro.
export function isOpen(status: SwitchStatus): boolean {
  return status.kind === "open";
}

function reject(reason: string): SwitchCommandResult {
  return { ok: false, reason };
}

export function requestSwitch(
  switchgear: Switchgear,
  id: SwitchId,
  to: SwitchTarget,
  config: SwitchgearConfig,
): SwitchCommandResult {
  const current = switchgear[id];

  if (current.kind === "moving") {
    return reject(`${id} está en maniobra`);
  }
  if (current.kind === to) {
    return reject(`${id} ya está ${targetLabels[to]}`);
  }
  if (to === "closed" && id === "QE") {
    if (!isOpen(switchgear.Q1) || !isOpen(switchgear.Q2)) {
      return reject("No se puede cerrar QE con Q1 o Q2 sin abrir (cortocircuito)");
    }
  }
  if (to === "closed" && id !== "QE" && !isOpen(switchgear.QE)) {
    return reject(`No se puede cerrar ${id} con la puesta a tierra sin abrir`);
  }

  const moving: SwitchStatus = {
    kind: "moving",
    to,
    remainingSeconds: config.operatingTimeSeconds[id],
  };
  return { ok: true, switchgear: { ...switchgear, [id]: moving } };
}

export function stepSwitchgear(switchgear: Switchgear, dtSeconds: number): Switchgear {
  return {
    Q1: stepSwitch(switchgear.Q1, dtSeconds),
    Q2: stepSwitch(switchgear.Q2, dtSeconds),
    QE: stepSwitch(switchgear.QE, dtSeconds),
  };
}

function stepSwitch(status: SwitchStatus, dtSeconds: number): SwitchStatus {
  if (status.kind !== "moving") {
    return status;
  }
  const remainingSeconds = status.remainingSeconds - dtSeconds;
  if (remainingSeconds <= 0) {
    return { kind: status.to };
  }
  return { ...status, remainingSeconds };
}
