import { describe, expect, test } from "vitest";
import {
  createStation,
  requestPowerOrder,
  requestTransition,
  type Station,
  type StationConfig,
} from "./station.ts";

const config: StationConfig = { pMinMW: 50, pMaxMW: 500, rampRateMWPerMin: 600 };

function coupled(powerMW: number, powerOrderMW = powerMW): Station {
  return { state: "coupled", powerMW, powerOrderMW };
}

describe("requestTransition", () => {
  test("una transición permitida devuelve la estación con el nuevo estado", () => {
    const result = requestTransition(createStation(), "decoupled");
    expect(result).toEqual({
      ok: true,
      station: { state: "decoupled", powerMW: 0, powerOrderMW: 0 },
    });
  });

  test("no modifica la estación original", () => {
    const station = createStation();
    requestTransition(station, "decoupled");
    expect(station.state).toBe("stopped");
  });

  test("una transición no permitida se rechaza con motivo", () => {
    const result = requestTransition(createStation(), "coupled");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("stopped → coupled");
    }
  });

  test("desacoplar con P = 0 está permitido", () => {
    const result = requestTransition(coupled(0), "decoupled");
    expect(result.ok).toBe(true);
  });

  test("desacoplar con P > 0 se rechaza", () => {
    const result = requestTransition(coupled(300), "decoupled");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("P debe ser 0");
    }
  });

  test("no se puede cambiar de estado durante una rampa", () => {
    const result = requestTransition(coupled(100, 300), "decoupled");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("rampa");
    }
  });
});

describe("requestPowerOrder", () => {
  test("solo se acepta consigna en coupled", () => {
    const result = requestPowerOrder(createStation(), 300, config);
    expect(result.ok).toBe(false);
  });

  test.each([0, 50, 250, 500])("acepta una consigna de %s MW", (orderMW) => {
    const result = requestPowerOrder(coupled(0), orderMW, config);
    expect(result).toEqual({ ok: true, station: coupled(0, orderMW) });
  });

  test.each([10, 49, 501, -100, Number.NaN, Number.POSITIVE_INFINITY])(
    "rechaza una consigna de %s MW",
    (orderMW) => {
      const result = requestPowerOrder(coupled(0), orderMW, config);
      expect(result.ok).toBe(false);
    },
  );
});
