import { describe, expect, test } from "vitest";
import { requestPowerOrder, requestTransition } from "./station.ts";
import { deriveState } from "./stationState.ts";
import { stationAt, testConfig } from "./testSupport.ts";

describe("requestTransition", () => {
  test("ir a decoupled ordena cerrar Q1", () => {
    const result = requestTransition(stationAt("stopped"), "decoupled", testConfig);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.station.switchgear.Q1).toEqual({
        kind: "moving",
        to: "closed",
        remainingSeconds: 2,
      });
      expect(deriveState(result.station.switchgear)).toBe("transition");
    }
  });

  test("ir a earthed ordena cerrar la puesta a tierra", () => {
    const result = requestTransition(stationAt("stopped"), "earthed", testConfig);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.station.switchgear.QE).toEqual({
        kind: "moving",
        to: "closed",
        remainingSeconds: 3,
      });
    }
  });

  test("no modifica la estación original", () => {
    const station = stationAt("stopped");
    requestTransition(station, "decoupled", testConfig);
    expect(deriveState(station.switchgear)).toBe("stopped");
  });

  test("una transición no permitida se rechaza con motivo", () => {
    const result = requestTransition(stationAt("stopped"), "coupled", testConfig);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("stopped → coupled");
    }
  });

  test("no acepta órdenes de estado durante una transición", () => {
    const first = requestTransition(stationAt("stopped"), "decoupled", testConfig);
    expect(first.ok).toBe(true);
    if (first.ok) {
      const second = requestTransition(first.station, "stopped", testConfig);
      expect(second.ok).toBe(false);
    }
  });

  test("desacoplar con P = 0 ordena abrir Q2", () => {
    const result = requestTransition(stationAt("coupled"), "decoupled", testConfig);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.station.switchgear.Q2).toEqual({
        kind: "moving",
        to: "open",
        remainingSeconds: 4,
      });
    }
  });

  test("Q2 no puede maniobrar con corriente", () => {
    const result = requestTransition(stationAt("coupled", 300), "decoupled", testConfig);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("P debe ser 0");
    }
  });

  test("no se puede cambiar de estado durante una rampa", () => {
    const result = requestTransition(stationAt("coupled", 100, 300), "decoupled", testConfig);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("rampa");
    }
  });
});

describe("requestPowerOrder", () => {
  test("solo se acepta consigna en coupled", () => {
    expect(requestPowerOrder(stationAt("decoupled"), 300, testConfig).ok).toBe(false);
  });

  test("no se acepta consigna mientras Q2 se está cerrando", () => {
    const result = requestTransition(stationAt("decoupled"), "coupled", testConfig);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(requestPowerOrder(result.station, 300, testConfig).ok).toBe(false);
    }
  });

  test.each([0, 50, 250, 500])("acepta una consigna de %s MW", (orderMW) => {
    const result = requestPowerOrder(stationAt("coupled"), orderMW, testConfig);
    expect(result).toEqual({ ok: true, station: stationAt("coupled", 0, orderMW) });
  });

  test.each([10, 49, 501, -100, Number.NaN, Number.POSITIVE_INFINITY])(
    "rechaza una consigna de %s MW",
    (orderMW) => {
      expect(requestPowerOrder(stationAt("coupled"), orderMW, testConfig).ok).toBe(false);
    },
  );
});
