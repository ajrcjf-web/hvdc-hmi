import { describe, expect, test } from "vitest";
import { measure } from "./measurements.ts";
import { requestTransition } from "./station.ts";
import type { StationState } from "./stationState.ts";
import { stationAt, testConfig } from "./testSupport.ts";

describe("measure", () => {
  test("en coupled, Udc es la tensión nominal", () => {
    expect(measure(stationAt("coupled", 300), testConfig).udcKV).toBe(500);
  });

  test("Idc es P / Udc", () => {
    expect(measure(stationAt("coupled", 500), testConfig).idcKA).toBe(1);
  });

  test("Idc con valores decimales", () => {
    expect(measure(stationAt("coupled", 300), testConfig).idcKA).toBeCloseTo(0.6);
  });

  test("acoplada sin potencia: hay tensión pero no corriente", () => {
    expect(measure(stationAt("coupled"), testConfig)).toEqual({ udcKV: 500, idcKA: 0 });
  });

  const notCoupled: StationState[] = ["earthed", "stopped", "decoupled"];

  test.each(notCoupled)("en %s no hay tensión ni corriente", (state) => {
    expect(measure(stationAt(state), testConfig)).toEqual({ udcKV: 0, idcKA: 0 });
  });

  test("mientras Q2 se cierra no hay tensión", () => {
    const result = requestTransition(stationAt("decoupled"), "coupled", testConfig);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(measure(result.station, testConfig).udcKV).toBe(0);
    }
  });
});
