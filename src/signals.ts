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
  "STATION.MODE": "Estación: modo de operación",
  "PROT.DISTANCE_Z1": "Protección de distancia (21), zona 1",
  "PROT.DISTANCE_Z2": "Protección de distancia (21), zona 2",
  "PROT.UNDERVOLTAGE_S1": "Protección de subtensión AC (27), escalón 1",
  "PROT.UNDERVOLTAGE_S2": "Protección de subtensión AC (27), escalón 2",
  "PROT.TRANSFORMER_DIFFERENTIAL": "Protección diferencial del transformador (87T)",
  "PROT.CONVERTER": "Protección del convertidor",
  "RELAY86.LOCKOUT": "Relé de bloqueo 86",
  "CMD.TO_EARTHED": "Orden: ir a earthed",
  "CMD.TO_STOPPED": "Orden: ir a stopped",
  "CMD.TO_DECOUPLED": "Orden: ir a decoupled",
  "CMD.TO_COUPLED": "Orden: ir a coupled",
  "CMD.BLOCK": "Orden: bloquear el convertidor",
  "CMD.DEBLOCK": "Orden: desbloquear el convertidor",
  "CMD.POWER_ORDER": "Orden: consigna de potencia",
  "CMD.RESET_86": "Orden: resetear el relé 86",
  "CMD.MODE_AUTOMATIC": "Orden: pasar a modo automático",
  "CMD.MODE_MANUAL": "Orden: pasar a modo manual",
  "CMD.Q1_OPEN": "Orden: abrir Q1",
  "CMD.Q1_CLOSE": "Orden: cerrar Q1",
  "CMD.Q2_OPEN": "Orden: abrir Q2",
  "CMD.Q2_CLOSE": "Orden: cerrar Q2",
  "CMD.QE_OPEN": "Orden: abrir QE",
  "CMD.QE_CLOSE": "Orden: cerrar QE",
  "ALARM.PROT_DISTANCE": "Alarma: actuó la protección de distancia (21)",
  "ALARM.PROT_UNDERVOLTAGE": "Alarma: actuó la protección de subtensión AC (27)",
  "ALARM.PROT_TRANSFORMER_DIFFERENTIAL": "Alarma: actuó la protección diferencial del transformador (87T)",
  "ALARM.PROT_CONVERTER": "Alarma: actuó la protección del convertidor",
  "ALARM.RELAY86_LOCKED": "Alarma: relé de bloqueo 86 enclavado",
  "ALARM.INCONSISTENT": "Alarma: estación inconsistente",
  "ALARM.TEST_URGENT": "Alarma de prueba: urgente",
  "ALARM.TEST_HIGH": "Alarma de prueba: alta",
  "ALARM.TEST_LOW": "Alarma de prueba: baja",
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
  // modo de operación
  automatic: "automático",
  manual: "manual",
  // protecciones y relé 86
  "picked-up": "arrancó",
  operated: "actuó",
  locked: "enclavado",
  // paso de una orden
  selected: "seleccionada",
  executed: "ejecutada",
  cancelled: "cancelada",
  expired: "expirada",
  rejected: "rechazada",
  // ciclo de vida de una alarma (ISA-18.2)
  "active-unacknowledged": "activa sin reconocer",
  "active-acknowledged": "activa reconocida",
  "returned-unacknowledged": "normalizada sin reconocer",
  normal: "normal",
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
