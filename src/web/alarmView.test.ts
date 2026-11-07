import { describe, expect, test } from "vitest";
import {
  acknowledge,
  createAlarmState,
  evaluateAlarms,
  setTestAlarm,
  type AlarmState,
  type TestAlarmCode,
} from "../alarms.ts";
import { formatTimestamp } from "../labels.ts";
import { stationAt } from "../testSupport.ts";
import { filterRows } from "./listFilter.ts";
import {
  describeAlarmSummary,
  summarizeAlarms,
  toAlarmRows,
  UNACKNOWLEDGED_SYMBOL,
} from "./alarmView.ts";

const START = new Date(2026, 10, 5, 14, 0, 0, 0).getTime();
const station = stationAt("stopped");

// Activa las alarmas de prueba dadas, una por segundo desde t = 1.
function activate(...codes: TestAlarmCode[]): AlarmState {
  let alarms = createAlarmState();
  codes.forEach((code, i) => {
    alarms = evaluateAlarms(setTestAlarm(alarms, code, true), station, i + 1).alarms;
  });
  return alarms;
}

describe("toAlarmRows", () => {
  test("sin alarmas activas no hay filas", () => {
    expect(toAlarmRows(createAlarmState(), START)).toEqual([]);
  });

  test("una fila tiene fecha y hora, prioridad por texto, descripción y estado", () => {
    const [row] = toAlarmRows(activate("ALARM.TEST_HIGH"), START);
    expect(row).toMatchObject({
      timestamp: formatTimestamp(START + 1000),
      priority: "!! Alta",
      description: "Alarma de prueba: alta",
      state: `${UNACKNOWLEDGED_SYMBOL} activa sin reconocer`,
      code: "ALARM.TEST_HIGH",
      unacknowledged: true,
    });
  });

  test("lo reconocido pierde el símbolo de sin reconocer pero sigue en la lista", () => {
    const alarms = acknowledge(activate("ALARM.TEST_HIGH"), "ALARM.TEST_HIGH", 5).alarms;
    const [row] = toAlarmRows(alarms, START);
    expect(row?.state).toBe("activa reconocida");
    expect(row?.unacknowledged).toBe(false);
    expect(row?.timestamp).toBe(formatTimestamp(START + 5000)); // hora del último cambio
  });

  test("una normalizada sin reconocer sigue visible; reconocida, desaparece", () => {
    let alarms = activate("ALARM.TEST_LOW");
    alarms = evaluateAlarms(setTestAlarm(alarms, "ALARM.TEST_LOW", false), station, 3).alarms;
    expect(toAlarmRows(alarms, START)[0]?.state).toBe(
      `${UNACKNOWLEDGED_SYMBOL} normalizada sin reconocer`,
    );
    alarms = acknowledge(alarms, "ALARM.TEST_LOW", 4).alarms;
    expect(toAlarmRows(alarms, START)).toEqual([]);
  });

  test("ordena por prioridad (urgente primero) y, dentro de una, la más reciente primero", () => {
    // Orden de activación: baja (t=1), urgente (t=2), alta (t=3).
    const rows = toAlarmRows(
      activate("ALARM.TEST_LOW", "ALARM.TEST_URGENT", "ALARM.TEST_HIGH"),
      START,
    );
    expect(rows.map((r) => r.code)).toEqual(["ALARM.TEST_URGENT", "ALARM.TEST_HIGH", "ALARM.TEST_LOW"]);
  });

  test("a igual prioridad, la que cambió más recientemente va primero", () => {
    // La de prueba se activa en t = 1 y la real (inconsistent) en t = 2: ambas urgentes.
    const inconsistent = {
      ...station,
      switchgear: { ...station.switchgear, QE: { kind: "closed" as const }, Q2: { kind: "closed" as const } },
    };
    let alarms = activate("ALARM.TEST_URGENT");
    alarms = evaluateAlarms(alarms, inconsistent, 2).alarms;
    expect(toAlarmRows(alarms, START).map((r) => r.code)).toEqual([
      "ALARM.INCONSISTENT",
      "ALARM.TEST_URGENT",
    ]);
  });

  test("los filtros de la planilla ignoran mayúsculas y acentos, y se combinan", () => {
    const rows = toAlarmRows(
      activate("ALARM.TEST_URGENT", "ALARM.TEST_HIGH", "ALARM.TEST_LOW"),
      START,
    );
    expect(filterRows(rows, { priority: "URGENTE" }).map((r) => r.code)).toEqual([
      "ALARM.TEST_URGENT",
    ]);
    expect(filterRows(rows, { description: "ALTA" }).map((r) => r.code)).toEqual([
      "ALARM.TEST_HIGH",
    ]);
    expect(filterRows(rows, { priority: "baja", description: "alta" })).toEqual([]);
    expect(filterRows(rows, { state: "sin reconocer" })).toHaveLength(3);
  });
});

describe("summarizeAlarms", () => {
  test("sin alarmas: cantidad 0, sin prioridad y sin intermitencia", () => {
    const summary = summarizeAlarms(createAlarmState());
    expect(summary).toEqual({ count: 0, unacknowledged: 0, highest: null, blinking: false });
    expect(describeAlarmSummary(summary)).toBe("Sin alarmas");
  });

  test("cuenta las visibles y toma la prioridad más alta", () => {
    const summary = summarizeAlarms(activate("ALARM.TEST_LOW", "ALARM.TEST_HIGH"));
    expect(summary).toMatchObject({ count: 2, unacknowledged: 2, highest: "high" });
    expect(describeAlarmSummary(summary)).toBe("2 alarmas · !! Alta");
  });

  test("intermitente si hay alguna sin reconocer; al reconocerlas todas, deja de parpadear", () => {
    let alarms = activate("ALARM.TEST_URGENT", "ALARM.TEST_LOW");
    expect(summarizeAlarms(alarms).blinking).toBe(true);

    alarms = acknowledge(alarms, "ALARM.TEST_URGENT", 5).alarms;
    expect(summarizeAlarms(alarms).blinking).toBe(true); // queda la baja sin reconocer

    alarms = acknowledge(alarms, "ALARM.TEST_LOW", 6).alarms;
    const summary = summarizeAlarms(alarms);
    expect(summary).toMatchObject({ count: 2, unacknowledged: 0, blinking: false });
    expect(describeAlarmSummary(summary)).toBe("2 alarmas · !!! Urgente");
  });

  test("la prioridad más alta es la de las alarmas visibles, no la de las normalizadas", () => {
    let alarms = activate("ALARM.TEST_URGENT", "ALARM.TEST_LOW");
    alarms = acknowledge(alarms, "ALARM.TEST_URGENT", 5).alarms;
    alarms = evaluateAlarms(setTestAlarm(alarms, "ALARM.TEST_URGENT", false), station, 6).alarms;
    expect(summarizeAlarms(alarms)).toMatchObject({ count: 1, highest: "low" });
  });

  test("una sola alarma va en singular", () => {
    expect(describeAlarmSummary(summarizeAlarms(activate("ALARM.TEST_HIGH")))).toBe(
      "1 alarma · !! Alta",
    );
  });
});
