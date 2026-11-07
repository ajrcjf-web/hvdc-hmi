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
import type { SignalCode } from "./signals.ts";
import type { Station } from "./station.ts";
import { deriveState } from "./stationState.ts";

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
export const alarmPriorities: Record<AlarmCode, AlarmPriority> = {
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
};

export type AlarmResult = { alarms: AlarmState; events: SignalEvent[] };

export function createAlarmState(): AlarmState {
  return {
    life: {
      "ALARM.INCONSISTENT": "normal",
      "ALARM.TEST_URGENT": "normal",
      "ALARM.TEST_HIGH": "normal",
      "ALARM.TEST_LOW": "normal",
    },
    forced: {
      "ALARM.TEST_URGENT": false,
      "ALARM.TEST_HIGH": false,
      "ALARM.TEST_LOW": false,
    },
  };
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
): Record<AlarmCode, boolean> {
  return {
    "ALARM.INCONSISTENT": deriveState(station.switchgear) === "inconsistent",
    "ALARM.TEST_URGENT": alarms.forced["ALARM.TEST_URGENT"],
    "ALARM.TEST_HIGH": alarms.forced["ALARM.TEST_HIGH"],
    "ALARM.TEST_LOW": alarms.forced["ALARM.TEST_LOW"],
  };
}

function withLife(
  alarms: AlarmState,
  changes: Partial<Record<AlarmCode, AlarmLifeState>>,
): AlarmState {
  return { ...alarms, life: { ...alarms.life, ...changes } };
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
): AlarmResult {
  const conditions = alarmConditions(station, alarms);
  const changes: Partial<Record<AlarmCode, AlarmLifeState>> = {};
  const events: SignalEvent[] = [];
  for (const code of alarmCodes) {
    const next = nextLife(alarms.life[code], conditions[code]);
    if (next !== alarms.life[code]) {
      changes[code] = next;
      events.push({ code, state: next, timeSeconds });
    }
  }
  return events.length === 0 ? { alarms, events } : { alarms: withLife(alarms, changes), events };
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
    alarms: withLife(alarms, { [code]: next }),
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
