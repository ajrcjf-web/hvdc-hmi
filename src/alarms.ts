// Alarmas (ISA-18.2 / IEC 62682): condiciones anormales que requieren una acción del
// operador. Una alarma tiene un código de señal (su descripción está en signals.ts),
// una prioridad y un ciclo de vida. Cada cambio del ciclo de vida es un evento del SER.
// Funciones puras: reciben el estado de las alarmas y devuelven uno nuevo.
//
// Ciclo de vida:
//   normal ── condición aparece ──▶ activa sin reconocer
//   activa sin reconocer ── reconocer ──▶ activa reconocida
//   activa sin reconocer ── condición desaparece ──▶ normalizada sin reconocer
//   activa reconocida ── condición desaparece ──▶ normal
//   normalizada sin reconocer ── reconocer ──▶ normal
//   normalizada sin reconocer ── condición reaparece ──▶ activa sin reconocer
// Reconocer ("la vi") nunca borra una alarma: sigue visible mientras esté activa
// o sin reconocer.

import type { SignalEvent } from "./events.ts";
import { isFunctionAlarmActive, type ProtectionConfig } from "./protections.ts";
import type { SignalCode } from "./signals.ts";
import type { Station } from "./station.ts";
import { deriveState } from "./stationState.ts";
import { atOrigin } from "./switchgear.ts";

export type AlarmPriority = "urgent" | "high" | "low";

export type AlarmCode = Extract<SignalCode, `ALARM.${string}`>;

// Las alarmas de prueba no salen de la planta: las activa y normaliza el instructor.
export type TestAlarmCode = Extract<AlarmCode, `ALARM.TEST_${string}`>;

// El ciclo de vida. Son también los estados del evento en el SER (ver signals.ts).
export type AlarmLifeState =
  | "active-unacknowledged"
  | "active-acknowledged"
  | "returned-unacknowledged"
  | "normal";

// Prioridad de cada alarma. El orden de las claves es el orden de evaluación.
// Las alarmas de protección van antes que la de inconsistencia: es su causa, y los eventos
// de un mismo ciclo salen en este orden.
export const alarmPriorities: Record<AlarmCode, AlarmPriority> = {
  "ALARM.PROT_DISTANCE": "urgent",
  "ALARM.PROT_UNDERVOLTAGE": "urgent",
  "ALARM.PROT_TRANSFORMER_DIFFERENTIAL": "urgent",
  "ALARM.PROT_CONVERTER": "urgent",
  "ALARM.RELAY86_LOCKED": "urgent",
  "ALARM.INCONSISTENT": "urgent",
  "ALARM.TEST_URGENT": "urgent",
  "ALARM.TEST_HIGH": "high",
  "ALARM.TEST_LOW": "low",
};

export const alarmCodes = Object.keys(alarmPriorities) as AlarmCode[];
export const testAlarmCodes = alarmCodes.filter((code): code is TestAlarmCode =>
  code.startsWith("ALARM.TEST_"),
);

export type AlarmState = {
  life: Record<AlarmCode, AlarmLifeState>;
  // Qué alarmas de prueba tiene activadas el instructor (la "condición" de esas alarmas).
  forced: Record<TestAlarmCode, boolean>;
  // Cuándo apareció cada alarma: el instante en que pasó a activa sin reconocer (tiempo
  // simulado, en s). Si se reactiva, es el de la nueva aparición. Reconocer y normalizar
  // no lo cambian: eso queda en el SER.
  activatedAtSeconds: Record<AlarmCode, number>;
};

export type AlarmResult = { alarms: AlarmState; events: SignalEvent[] };

export function createAlarmState(): AlarmState {
  // Se arma a partir de la tabla de prioridades: una alarma nueva no se puede olvidar aquí.
  const life = Object.fromEntries(alarmCodes.map((code) => [code, "normal"])) as Record<
    AlarmCode,
    AlarmLifeState
  >;
  const activatedAtSeconds = Object.fromEntries(alarmCodes.map((code) => [code, 0])) as Record<
    AlarmCode,
    number
  >;
  const forced = Object.fromEntries(testAlarmCodes.map((code) => [code, false])) as Record<
    TestAlarmCode,
    boolean
  >;
  return { life, activatedAtSeconds, forced };
}

// Una alarma es visible mientras esté activa o sin reconocer; en normal desaparece.
export function isVisible(life: AlarmLifeState): boolean {
  return life !== "normal";
}

export function isUnacknowledged(life: AlarmLifeState): boolean {
  return life === "active-unacknowledged" || life === "returned-unacknowledged";
}

// Los códigos de las alarmas visibles, en el orden de la tabla.
export function visibleAlarms(alarms: AlarmState): AlarmCode[] {
  return alarmCodes.filter((code) => isVisible(alarms.life[code]));
}

// ¿Está presente la condición de cada alarma?
export function alarmConditions(
  station: Station,
  alarms: AlarmState,
  config: ProtectionConfig,
): Record<AlarmCode, boolean> {
  return {
    // "Protección X actuó": activa mientras la falla siga presente y se normaliza cuando el
    // instructor la despeja. Así el operador ve en la lista de alarmas cuándo se despejó la
    // falla, que es la señal de que puede resetear el 86.
    // (La actuó algún elemento de la función y su causa sigue presente.)
    "ALARM.PROT_DISTANCE": isFunctionAlarmActive("distance", station, config),
    "ALARM.PROT_UNDERVOLTAGE": isFunctionAlarmActive("acUndervoltage", station, config),
    "ALARM.PROT_TRANSFORMER_DIFFERENTIAL": isFunctionAlarmActive("transformerDifferential", station, config),
    "ALARM.PROT_CONVERTER": isFunctionAlarmActive("converterProtection", station, config),
    // "Relé 86 enclavado": activa hasta el reset del 86.
    "ALARM.RELAY86_LOCKED": station.relay86.locked,
    // Un equipo en maniobra cuenta en su posición de origen: la alarma no se normaliza al
    // empezar la maniobra que la resuelve (ni aparece antes de que termine la que la causa).
    "ALARM.INCONSISTENT": deriveState(atOrigin(station.switchgear)) === "inconsistent",
    "ALARM.TEST_URGENT": alarms.forced["ALARM.TEST_URGENT"],
    "ALARM.TEST_HIGH": alarms.forced["ALARM.TEST_HIGH"],
    "ALARM.TEST_LOW": alarms.forced["ALARM.TEST_LOW"],
  };
}

// Aplica los cambios del ciclo de vida. Anota la hora solo cuando una alarma aparece
// (pasa a activa sin reconocer); reconocer o normalizar no la cambian.
function withLife(
  alarms: AlarmState,
  changes: Partial<Record<AlarmCode, AlarmLifeState>>,
  timeSeconds: number,
): AlarmState {
  const activatedAt = { ...alarms.activatedAtSeconds };
  for (const code of Object.keys(changes) as AlarmCode[]) {
    if (changes[code] === "active-unacknowledged") {
      activatedAt[code] = timeSeconds;
    }
  }
  return { ...alarms, life: { ...alarms.life, ...changes }, activatedAtSeconds: activatedAt };
}

// Qué le pasa a una alarma cuando su condición aparece o desaparece.
function nextLife(life: AlarmLifeState, conditionPresent: boolean): AlarmLifeState {
  if (conditionPresent) {
    // Aparece (o reaparece antes de reconocer la normalización): vuelve a pedir atención.
    return life === "normal" || life === "returned-unacknowledged"
      ? "active-unacknowledged"
      : life;
  }
  if (life === "active-unacknowledged") return "returned-unacknowledged";
  if (life === "active-acknowledged") return "normal";
  return life;
}

// Evalúa las condiciones y avanza el ciclo de vida de cada alarma. Cada cambio deja un
// evento con la hora dada. Si no cambió nada, devuelve las mismas alarmas y ningún evento.
export function evaluateAlarms(
  alarms: AlarmState,
  station: Station,
  timeSeconds: number,
  config: ProtectionConfig,
): AlarmResult {
  const conditions = alarmConditions(station, alarms, config);
  const changes: Partial<Record<AlarmCode, AlarmLifeState>> = {};
  const events: SignalEvent[] = [];
  for (const code of alarmCodes) {
    const next = nextLife(alarms.life[code], conditions[code]);
    if (next !== alarms.life[code]) {
      changes[code] = next;
      events.push({ code, state: next, timeSeconds });
    }
  }
  return events.length === 0 ? { alarms, events } : { alarms: withLife(alarms, changes, timeSeconds), events };
}

// Reconocer: "la vi". Una activa sin reconocer pasa a reconocida; una normalizada sin
// reconocer pasa a normal. En cualquier otro estado no hace nada (ni deja evento).
export function acknowledge(alarms: AlarmState, code: AlarmCode, timeSeconds: number): AlarmResult {
  const life = alarms.life[code];
  const next: AlarmLifeState | null =
    life === "active-unacknowledged"
      ? "active-acknowledged"
      : life === "returned-unacknowledged"
        ? "normal"
        : null;
  if (next === null) {
    return { alarms, events: [] };
  }
  return {
    alarms: withLife(alarms, { [code]: next }, timeSeconds),
    events: [{ code, state: next, timeSeconds }],
  };
}

// Reconoce solo las alarmas de la lista: las que la ventana muestra con sus filtros.
// Una alarma que no está en la lista no se toca: reconocer es decir "la vi".
export function acknowledgeMany(
  alarms: AlarmState,
  codes: AlarmCode[],
  timeSeconds: number,
): AlarmResult {
  let current = alarms;
  const events: SignalEvent[] = [];
  for (const code of new Set(codes)) {
    const result = acknowledge(current, code, timeSeconds);
    current = result.alarms;
    events.push(...result.events);
  }
  return { alarms: current, events };
}

// El instructor activa o normaliza una alarma de prueba. Solo cambia su condición: el
// ciclo de vida lo avanza evaluateAlarms en el siguiente ciclo, como con cualquier alarma.
export function setTestAlarm(alarms: AlarmState, code: TestAlarmCode, active: boolean): AlarmState {
  return alarms.forced[code] === active
    ? alarms
    : { ...alarms, forced: { ...alarms.forced, [code]: active } };
}
