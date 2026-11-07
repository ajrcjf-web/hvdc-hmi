import { describe, expect, test } from "vitest";
import {
  acknowledge,
  acknowledgeMany,
  alarmCodes,
  alarmPriorities,
  createAlarmState,
  evaluateAlarms,
  isUnacknowledged,
  isVisible,
  setTestAlarm,
  testAlarmCodes,
  visibleAlarms,
  type AlarmCode,
  type AlarmState,
} from "./alarms.ts";
import { describeSignal } from "./signals.ts";
import type { Station } from "./station.ts";
import { stationAt } from "./testSupport.ts";

const normalStation = stationAt("stopped");
// Q1 cerrado y Q2 cerrado con QE cerrado: ninguna posición corresponde a un estado.
const inconsistentStation: Station = {
  ...normalStation,
  switchgear: { ...normalStation.switchgear, QE: { kind: "closed" }, Q2: { kind: "closed" } },
};

const urgent = "ALARM.TEST_URGENT";
const high = "ALARM.TEST_HIGH";
const low = "ALARM.TEST_LOW";

const life = (alarms: AlarmState, code: AlarmCode) => alarms.life[code];

// Activa la condición de una alarma de prueba y evalúa, como hace el ciclo.
function activated(code: typeof urgent | typeof high | typeof low, at = 0): AlarmState {
  return evaluateAlarms(setTestAlarm(createAlarmState(), code, true), normalStation, at).alarms;
}

describe("la tabla de alarmas", () => {
  test("cada alarma tiene prioridad y su descripción en la tabla de señales", () => {
    for (const code of alarmCodes) {
      expect(["urgent", "high", "low"]).toContain(alarmPriorities[code]);
      expect(describeSignal(code)).toEqual(expect.any(String));
    }
  });

  test("inconsistent es urgente y hay una alarma de prueba por prioridad", () => {
    expect(alarmPriorities["ALARM.INCONSISTENT"]).toBe("urgent");
    expect(testAlarmCodes.map((code) => alarmPriorities[code]).sort()).toEqual([
      "high",
      "low",
      "urgent",
    ]);
  });

  test("al empezar, todas están en normal y no hay ninguna visible", () => {
    const alarms = createAlarmState();
    expect(alarmCodes.every((code) => life(alarms, code) === "normal")).toBe(true);
    expect(visibleAlarms(alarms)).toEqual([]);
  });
});

describe("evaluateAlarms: ciclo de vida completo", () => {
  test("normal → activa sin reconocer → reconocida → normal, con un evento por cambio", () => {
    const events: { state: string; timeSeconds: number }[] = [];
    let alarms = setTestAlarm(createAlarmState(), urgent, true);

    // 1. La condición aparece.
    let result = evaluateAlarms(alarms, normalStation, 1);
    alarms = result.alarms;
    events.push(...result.events);
    expect(life(alarms, urgent)).toBe("active-unacknowledged");

    // 2. El operador la reconoce: sigue en la lista.
    result = acknowledge(alarms, urgent, 2);
    alarms = result.alarms;
    events.push(...result.events);
    expect(life(alarms, urgent)).toBe("active-acknowledged");
    expect(visibleAlarms(alarms)).toEqual([urgent]);

    // 3. La condición desaparece estando reconocida: pasa a normal y sale de la lista.
    alarms = setTestAlarm(alarms, urgent, false);
    result = evaluateAlarms(alarms, normalStation, 3);
    alarms = result.alarms;
    events.push(...result.events);
    expect(life(alarms, urgent)).toBe("normal");
    expect(visibleAlarms(alarms)).toEqual([]);

    expect(events).toEqual([
      { code: urgent, state: "active-unacknowledged", timeSeconds: 1 },
      { code: urgent, state: "active-acknowledged", timeSeconds: 2 },
      { code: urgent, state: "normal", timeSeconds: 3 },
    ]);
  });

  test("normal → activa sin reconocer → normalizada sin reconocer → normal", () => {
    let alarms = activated(high);
    expect(life(alarms, high)).toBe("active-unacknowledged");

    // La condición desaparece sin que nadie la haya visto: sigue visible.
    alarms = evaluateAlarms(setTestAlarm(alarms, high, false), normalStation, 1).alarms;
    expect(life(alarms, high)).toBe("returned-unacknowledged");
    expect(visibleAlarms(alarms)).toEqual([high]);

    // Reconocerla la lleva a normal.
    const result = acknowledge(alarms, high, 2);
    expect(life(result.alarms, high)).toBe("normal");
    expect(result.events).toEqual([{ code: high, state: "normal", timeSeconds: 2 }]);
  });

  test("si la condición reaparece antes de reconocer la normalización, vuelve a activa sin reconocer", () => {
    let alarms = activated(low);
    alarms = evaluateAlarms(setTestAlarm(alarms, low, false), normalStation, 1).alarms;
    expect(life(alarms, low)).toBe("returned-unacknowledged");

    const result = evaluateAlarms(setTestAlarm(alarms, low, true), normalStation, 2);
    expect(life(result.alarms, low)).toBe("active-unacknowledged");
    expect(result.events).toEqual([{ code: low, state: "active-unacknowledged", timeSeconds: 2 }]);
  });

  test("una alarma reconocida cuya condición sigue presente se queda activa reconocida", () => {
    const acked = acknowledge(activated(urgent), urgent, 1).alarms;
    const result = evaluateAlarms(acked, normalStation, 2);
    expect(life(result.alarms, urgent)).toBe("active-acknowledged");
    expect(result.events).toEqual([]);
  });

  test("sin cambios no hay eventos y las alarmas son las mismas", () => {
    const alarms = createAlarmState();
    const result = evaluateAlarms(alarms, normalStation, 0);
    expect(result.events).toEqual([]);
    expect(result.alarms).toBe(alarms);
  });

  test("las alarmas son independientes entre sí", () => {
    const alarms = evaluateAlarms(
      setTestAlarm(setTestAlarm(createAlarmState(), urgent, true), low, true),
      normalStation,
      0,
    ).alarms;
    expect(visibleAlarms(alarms)).toEqual([urgent, low]);
    expect(life(alarms, high)).toBe("normal");
  });
});

describe("la alarma de inconsistent", () => {
  test("se activa cuando la estación queda inconsistente y se normaliza cuando deja de estarlo", () => {
    const on = evaluateAlarms(createAlarmState(), inconsistentStation, 5);
    expect(on.events).toEqual([
      { code: "ALARM.INCONSISTENT", state: "active-unacknowledged", timeSeconds: 5 },
    ]);

    const off = evaluateAlarms(on.alarms, normalStation, 6);
    expect(off.events).toEqual([
      { code: "ALARM.INCONSISTENT", state: "returned-unacknowledged", timeSeconds: 6 },
    ]);
  });

  test("en transición (equipo en maniobra) no es inconsistent: no hay alarma", () => {
    const moving: Station = {
      ...normalStation,
      switchgear: { ...normalStation.switchgear, Q1: { kind: "moving", to: "closed", remainingSeconds: 1 } },
    };
    expect(evaluateAlarms(createAlarmState(), moving, 0).events).toEqual([]);
  });
});

describe("reconocer", () => {
  test("reconocer no borra la alarma y no cambia la condición", () => {
    const result = acknowledge(activated(urgent), urgent, 1);
    expect(isVisible(life(result.alarms, urgent))).toBe(true);
    expect(result.alarms.forced[urgent]).toBe(true);
  });

  test("reconocer una alarma en normal, o ya reconocida, no hace nada ni deja evento", () => {
    const normal = createAlarmState();
    expect(acknowledge(normal, urgent, 0)).toEqual({ alarms: normal, events: [] });

    const acked = acknowledge(activated(urgent), urgent, 1).alarms;
    expect(acknowledge(acked, urgent, 2)).toEqual({ alarms: acked, events: [] });
  });

  test("isUnacknowledged: solo las dos situaciones sin reconocer", () => {
    expect(isUnacknowledged("active-unacknowledged")).toBe(true);
    expect(isUnacknowledged("returned-unacknowledged")).toBe(true);
    expect(isUnacknowledged("active-acknowledged")).toBe(false);
    expect(isUnacknowledged("normal")).toBe(false);
  });

  test("reconocer varias reconoce solo las de la lista", () => {
    const all = evaluateAlarms(
      testAlarmCodes.reduce((a, c) => setTestAlarm(a, c, true), createAlarmState()),
      normalStation,
      0,
    ).alarms;
    const result = acknowledgeMany(all, [urgent, low], 1);
    expect(life(result.alarms, urgent)).toBe("active-acknowledged");
    expect(life(result.alarms, low)).toBe("active-acknowledged");
    expect(life(result.alarms, high)).toBe("active-unacknowledged"); // no estaba en la lista
    expect(result.events.map((e) => e.code)).toEqual([urgent, low]);
  });

  test("reconocer varias con una lista vacía no hace nada", () => {
    const alarms = activated(urgent);
    expect(acknowledgeMany(alarms, [], 1)).toEqual({ alarms, events: [] });
  });

  test("un código repetido en la lista se reconoce una sola vez", () => {
    const result = acknowledgeMany(activated(urgent), [urgent, urgent], 1);
    expect(result.events).toHaveLength(1);
  });
});

describe("alarmas de prueba", () => {
  test("activar cambia la condición, no el ciclo de vida: eso lo hace la evaluación", () => {
    const alarms = setTestAlarm(createAlarmState(), high, true);
    expect(alarms.forced[high]).toBe(true);
    expect(life(alarms, high)).toBe("normal");
  });

  test("activar dos veces seguidas deja las mismas alarmas", () => {
    const alarms = setTestAlarm(createAlarmState(), high, true);
    expect(setTestAlarm(alarms, high, true)).toBe(alarms);
  });

  test("no modifica las alarmas recibidas", () => {
    const alarms = createAlarmState();
    setTestAlarm(alarms, high, true);
    acknowledge(activated(high), high, 1);
    expect(alarms).toEqual(createAlarmState());
  });
});

describe("cuándo apareció cada alarma", () => {
  const appear = (at: number) =>
    evaluateAlarms(setTestAlarm(createAlarmState(), urgent, true), normalStation, at).alarms;

  test("anota el instante en que la alarma aparece", () => {
    expect(appear(4).activatedAtSeconds[urgent]).toBe(4);
  });

  test("reconocer no cambia la hora de aparición", () => {
    expect(acknowledge(appear(4), urgent, 7).alarms.activatedAtSeconds[urgent]).toBe(4);
  });

  test("normalizar no cambia la hora de aparición", () => {
    const returned = evaluateAlarms(setTestAlarm(appear(4), urgent, false), normalStation, 9).alarms;
    expect(returned.life[urgent]).toBe("returned-unacknowledged");
    expect(returned.activatedAtSeconds[urgent]).toBe(4);
  });

  test("lo que no cambia conserva su instante", () => {
    const later = evaluateAlarms(appear(4), normalStation, 9);
    expect(later.alarms.activatedAtSeconds[urgent]).toBe(4);
    expect(appear(4).activatedAtSeconds[high]).toBe(0);
  });

  test("si la alarma se reactiva, la hora es la de la nueva aparición", () => {
    let alarms = evaluateAlarms(setTestAlarm(appear(4), urgent, false), normalStation, 6).alarms;
    alarms = evaluateAlarms(setTestAlarm(alarms, urgent, true), normalStation, 8).alarms;
    expect(alarms.life[urgent]).toBe("active-unacknowledged");
    expect(alarms.activatedAtSeconds[urgent]).toBe(8);
  });

  test("tras reconocer la normalización y volver a aparecer, también es la nueva hora", () => {
    let alarms = acknowledge(appear(4), urgent, 5).alarms;
    alarms = evaluateAlarms(setTestAlarm(alarms, urgent, false), normalStation, 6).alarms; // normal
    alarms = evaluateAlarms(setTestAlarm(alarms, urgent, true), normalStation, 10).alarms;
    expect(alarms.activatedAtSeconds[urgent]).toBe(10);
  });
});
