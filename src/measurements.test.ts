import { describe, expect, test } from "vitest";
import { measure } from "./measurements.ts";
import type { StationState } from "./stationState.ts";
import { deblockedAt, stationAt } from "./testSupport.ts";

describe("measure", () => {
  test("Udc es la tensión de la estación", () => {
    expect(measure(deblockedAt(300)).udcKV).toBe(500);
  });

  test("Idc es P / Udc", () => {
    expect(measure(deblockedAt(500)).idcKA).toBe(1);
  });

  test("Idc con valores decimales", () => {
    expect(measure(deblockedAt(300)).idcKA).toBeCloseTo(0.6);
  });

  test("desbloqueado sin potencia: hay tensión pero no corriente", () => {
    expect(measure(deblockedAt())).toEqual({ udcKV: 500, idcKA: 0 });
  });

  test("acoplado con el convertidor bloqueado: sin tensión ni corriente", () => {
    expect(measure(stationAt("coupled"))).toEqual({ udcKV: 0, idcKA: 0 });
  });

  const notCoupled: StationState[] = ["earthed", "stopped", "decoupled"];

  test.each(notCoupled)("en %s no hay tensión ni corriente", (state) => {
    expect(measure(stationAt(state))).toEqual({ udcKV: 0, idcKA: 0 });
  });
});
