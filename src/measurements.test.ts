import { describe, expect, test } from "vitest";
import { measure } from "./measurements.ts";
import type { Station, StationConfig } from "./station.ts";
import type { StationState } from "./stationState.ts";

const config: StationConfig = {
  pMinMW: 50,
  pMaxMW: 500,
  rampRateMWPerMin: 600,
  ratedVoltageKV: 500,
};

function coupled(powerMW: number): Station {
  return { state: "coupled", powerMW, powerOrderMW: powerMW };
}

describe("measure", () => {
  test("en coupled, Udc es la tensión nominal", () => {
    expect(measure(coupled(300), config).udcKV).toBe(500);
  });

  test("Idc es P / Udc", () => {
    expect(measure(coupled(500), config).idcKA).toBe(1);
  });

  test("Idc con valores decimales", () => {
    expect(measure(coupled(300), config).idcKA).toBeCloseTo(0.6);
  });

  test("acoplada sin potencia: hay tensión pero no corriente", () => {
    expect(measure(coupled(0), config)).toEqual({ udcKV: 500, idcKA: 0 });
  });

  const notCoupled: StationState[] = ["earthed", "stopped", "decoupled"];

  test.each(notCoupled)("en %s no hay tensión ni corriente", (state) => {
    const station: Station = { state, powerMW: 0, powerOrderMW: 0 };
    expect(measure(station, config)).toEqual({ udcKV: 0, idcKA: 0 });
  });
});
