// Aparamenta: interruptores y seccionadores de la estación, con sus
// posiciones, tiempos de maniobra y enclavamientos.
// Funciones puras: reciben la aparamenta y devuelven una nueva.

import { isTimeUp, wholeSecondsLeft } from "./simulationTime.ts";

export const switchIds = ["Q1", "Q2", "QE"] as const;
export type SwitchId = (typeof switchIds)[number];
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

const directionLabels: Record<SwitchTarget, string> = {
  open: "apertura",
  closed: "cierre",
};

// Segundos enteros que faltan, redondeados hacia arriba. wholeSecondsLeft tolera el
// error decimal del tiempo acumulado (6.000000000000001 no suma un segundo de más),
// y aquí nunca baja de 1 mientras el equipo siga en maniobra.
function secondsLeft(remainingSeconds: number): number {
  return Math.max(1, wholeSecondsLeft(remainingSeconds));
}

// Describe las maniobras en curso para los motivos de rechazo (por ejemplo,
// "Q2 en maniobra (cierre), faltan 6 s"). Si hay varios equipos, los menciona a todos.
// Devuelve null si ningún equipo se mueve.
export function describeMovingSwitches(switchgear: Switchgear): string | null {
  const descriptions: string[] = [];
  for (const id of switchIds) {
    const status = switchgear[id];
    if (status.kind === "moving") {
      descriptions.push(
        `${id} en maniobra (${directionLabels[status.to]}), faltan ${secondsLeft(status.remainingSeconds)} s`,
      );
    }
  }
  return descriptions.length > 0 ? descriptions.join("; ") : null;
}

export function requestSwitch(
  switchgear: Switchgear,
  id: SwitchId,
  to: SwitchTarget,
  config: SwitchgearConfig,
): SwitchCommandResult {
  const current = switchgear[id];

  if (current.kind === "moving") {
    return reject(describeMovingSwitches(switchgear) ?? `${id} está en maniobra`);
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
  if (to === "closed" && id === "Q2" && switchgear.Q1.kind !== "closed") {
    return reject("No se puede cerrar Q2 con Q1 sin cerrar: se cierra primero Q1");
  }
  if (to === "closed" && id === "Q1" && !isOpen(switchgear.Q2)) {
    return reject("No se puede cerrar Q1 con Q2 sin abrir");
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
  // No se compara con <= 0: restar dt muchas veces deja un residuo positivo (1.39e-16).
  if (isTimeUp(remainingSeconds)) {
    return { kind: status.to };
  }
  return { ...status, remainingSeconds };
}

// La aparamenta con cada equipo en maniobra en su posición de origen (la contraria a su
// destino). Sirve para juzgar la estación sin dar por hecho que una maniobra terminará:
// misma regla que "un equipo en maniobra no cuenta como abierto".
export function atOrigin(switchgear: Switchgear): Switchgear {
  const origin = (status: SwitchStatus): SwitchStatus =>
    status.kind === "moving" ? { kind: status.to === "open" ? "closed" : "open" } : status;
  return { Q1: origin(switchgear.Q1), Q2: origin(switchgear.Q2), QE: origin(switchgear.QE) };
}
