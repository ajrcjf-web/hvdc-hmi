// Tabla de señales: código → descripción. Hace el papel de la base de datos del
// Gateway de una estación real: quien genera los eventos solo conoce códigos y
// estados, nunca escribe textos. Los textos (en español) viven solo aquí.

// Cada señal es algo que puede registrarse. El código no cambia aunque cambie el texto.
export const signalDescriptions = {
  "Q1.POS": "Q1 (interruptor AC): posición",
  "Q2.POS": "Q2 (seccionador DC): posición",
  "QE.POS": "QE (puesta a tierra): posición",
  "STATION.STATE": "Estación: estado",
  "CONVERTER.BLOCK": "Convertidor: bloqueo",
  "CMD.TO_EARTHED": "Orden: ir a earthed",
  "CMD.TO_STOPPED": "Orden: ir a stopped",
  "CMD.TO_DECOUPLED": "Orden: ir a decoupled",
  "CMD.TO_COUPLED": "Orden: ir a coupled",
  "CMD.BLOCK": "Orden: bloquear el convertidor",
  "CMD.DEBLOCK": "Orden: desbloquear el convertidor",
  "CMD.POWER_ORDER": "Orden: consigna de potencia",
} as const;

export type SignalCode = keyof typeof signalDescriptions;

// El estado de la señal en el momento del evento (la columna "Estado" del SER).
export const signalStateLabels = {
  // posición de un equipo
  open: "abierto",
  closed: "cerrado",
  moving: "en maniobra",
  // estado de la estación (los cuatro estados y las dos situaciones extra)
  earthed: "earthed",
  stopped: "stopped",
  decoupled: "decoupled",
  coupled: "coupled",
  transition: "en transición",
  inconsistent: "inconsistente",
  // convertidor
  blocked: "bloqueado",
  deblocked: "desbloqueado",
  // paso de una orden
  selected: "seleccionada",
  executed: "ejecutada",
  cancelled: "cancelada",
  expired: "expirada",
  rejected: "rechazada",
} as const;

export type SignalState = keyof typeof signalStateLabels;

// Los pasos de una orden que se registran como evento.
export type CommandStep = "selected" | "executed" | "cancelled" | "expired" | "rejected";

export function describeSignal(code: SignalCode): string {
  return signalDescriptions[code];
}

export function describeSignalState(state: SignalState): string {
  return signalStateLabels[state];
}
