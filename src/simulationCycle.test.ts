import { describe, expect, test } from "vitest";
import { runCycle, type ScheduledCommand } from "./simulationCycle.ts";
import { requestPowerOrder } from "./station.ts";
import { deblockedAt, stationAt, testConfig } from "./testSupport.ts";

const order = (atSeconds: number, powerMW: number): ScheduledCommand => ({
  atSeconds,
  label: `Consigna ${powerMW} MW`,
  run: (s) => requestPowerOrder(s, powerMW, testConfig),
});

describe("runCycle: orden de los pasos", () => {
  test("las órdenes se aplican antes de que la planta evolucione", () => {
    // Si step corriera primero, la potencia seguiría en 0.
    const result = runCycle(deblockedAt(0), 0, [order(0, 100)], 1, testConfig);
    expect(result.station.powerMW).toBe(10);
    expect(result.station.powerOrderMW).toBe(100);
  });

  test("el registro ve las órdenes ya aplicadas, pero no la evolución", () => {
    const result = runCycle(deblockedAt(0), 0, [order(0, 100)], 1, testConfig);
    const snapshot = result.events.find((e) => e.kind === "snapshot");
    expect(snapshot).toMatchObject({
      station: { powerOrderMW: 100, powerMW: 0 },
    });
  });

  test("las órdenes del mismo instante se aplican en orden", () => {
    const result = runCycle(
      deblockedAt(0),
      0,
      [order(0, 100), order(0, 200)],
      1,
      testConfig,
    );
    expect(result.station.powerOrderMW).toBe(200);
  });

  test("los eventos salen en el orden en que ocurrieron", () => {
    const result = runCycle(deblockedAt(0), 0, [order(0, 100)], 1, testConfig);
    expect(result.events.map((e) => e.kind)).toEqual(["command", "snapshot"]);
  });
});

describe("runCycle: tiempo", () => {
  test("el tiempo avanza dt", () => {
    expect(runCycle(deblockedAt(0), 7, [], 2, testConfig).timeSeconds).toBe(9);
  });

  test("solo corren las órdenes de su instante", () => {
    const result = runCycle(deblockedAt(0), 3, [order(4, 100)], 1, testConfig);
    expect(result.events.filter((e) => e.kind === "command")).toEqual([]);
    expect(result.station.powerOrderMW).toBe(0);
  });

  test("registra el estado cada 5 s", () => {
    const hasSnapshot = (t: number) =>
      runCycle(deblockedAt(0), t, [], 1, testConfig).events.some(
        (e) => e.kind === "snapshot",
      );
    expect([0, 5, 10].map(hasSnapshot)).toEqual([true, true, true]);
    expect([1, 3, 7].map(hasSnapshot)).toEqual([false, false, false]);
  });
});

describe("runCycle: órdenes rechazadas", () => {
  test("queda como evento con su motivo y no rompe el ciclo", () => {
    // Convertidor bloqueado: la consigna se rechaza.
    const result = runCycle(stationAt("coupled"), 0, [order(0, 100)], 1, testConfig);
    const event = result.events.find((e) => e.kind === "command");
    expect(event).toMatchObject({ result: { ok: false } });
    expect(result.station.powerOrderMW).toBe(0);
  });
});

describe("runCycle: pureza", () => {
  test("no modifica la estación ni el escenario recibidos", () => {
    const station = deblockedAt(0);
    const scenario = [order(0, 100)];
    runCycle(station, 0, scenario, 1, testConfig);
    expect(station.powerOrderMW).toBe(0);
    expect(station.powerMW).toBe(0);
    expect(scenario).toHaveLength(1);
  });
});
